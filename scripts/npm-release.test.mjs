import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import {
  fetchPublishedVersion,
  inspectTarball,
  loadExpectedPackages,
  npmCommand,
  registryPublicationPlan,
  resolveNpmCliPath,
  runCommand,
  sortPackages,
  SYSTEM_TAR,
  verifyNpmArtifacts,
  waitForPublishedIntegrity,
} from "./npm-release-lib.mjs";

test("npm CLI resolves from the active Node runtime", () => {
  const npmCli = resolveNpmCliPath();
  assert.equal(path.basename(npmCli), "npm-cli.js");
  assert.ok(
    npmCli.startsWith(path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/"))
  );
});

test("npm lifecycle commands use the active Node runtime", () => {
  const result = npmCommand(["exec", "--", "node", "-p", "process.version"], {
    capture: true,
  });
  assert.equal(result.stdout.trim(), process.version);
});

test("publish order places internal dependencies before dependants", () => {
  const ordered = sortPackages([
    { name: "@oaslananka/atlas", dependencies: { "@oaslananka/shared": "1.0.0" } },
    { name: "@oaslananka/shared", dependencies: {} },
  ]);

  assert.deepEqual(
    ordered.map((pkg) => pkg.name),
    ["@oaslananka/shared", "@oaslananka/atlas"]
  );
});

test("publish order rejects dependency cycles", () => {
  assert.throws(
    () =>
      sortPackages([
        { name: "@oaslananka/a", dependencies: { "@oaslananka/b": "1.0.0" } },
        { name: "@oaslananka/b", dependencies: { "@oaslananka/a": "1.0.0" } },
      ]),
    /Circular publish dependency/u
  );
});

test("artifact verification enforces checksums, built entrypoints, and exact internal versions", async () => {
  const fixture = await createFixture();
  try {
    const manifest = await verifyNpmArtifacts({
      root: fixture.root,
      artifactsDir: fixture.artifactsDir,
      checksumsPath: fixture.checksumsPath,
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });

    assert.deepEqual(
      manifest.packages.map((pkg) => `${pkg.name}@${pkg.version}`),
      ["@oaslananka/shared@1.0.0", "@oaslananka/atlas@1.0.0"]
    );
    assert.equal(manifest.generated_at, "2026-07-22T00:00:00.000Z");
    assert.match(manifest.packages[0].integrity, /^sha512-/u);
    assert.deepEqual(manifest.packages[1].bins, ["atlas"]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("artifact verification rejects packages without built dist files", async () => {
  const fixture = await createFixture({ omitAtlasDist: true });
  try {
    await assert.rejects(
      verifyNpmArtifacts({
        root: fixture.root,
        artifactsDir: fixture.artifactsDir,
        checksumsPath: fixture.checksumsPath,
      }),
      /does not contain built dist files/u
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("artifact verification rejects symbolic links and special archive entries", async () => {
  const fixture = await createFixture({ atlasSymlink: true });
  try {
    await assert.rejects(
      verifyNpmArtifacts({
        root: fixture.root,
        artifactsDir: fixture.artifactsDir,
        checksumsPath: fixture.checksumsPath,
      }),
      /link or special archive entry/u
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("publication plan skips identical immutable versions and publishes missing versions", async () => {
  const releaseManifest = {
    packages: [
      {
        name: "@oaslananka/shared",
        version: "1.0.0",
        integrity: "sha512-shared",
        shasum: "shared-sha1",
      },
      {
        name: "@oaslananka/atlas",
        version: "1.0.0",
        integrity: "sha512-atlas",
        shasum: "atlas-sha1",
      },
    ],
  };
  const fetchImpl = async (url) => {
    if (url.includes("shared")) {
      return response(200, {
        versions: { "1.0.0": { dist: { integrity: "sha512-shared" } } },
      });
    }
    return response(404, {});
  };

  const plan = await registryPublicationPlan(releaseManifest, fetchImpl);
  assert.deepEqual(
    plan.map((entry) => [entry.name, entry.action]),
    [
      ["@oaslananka/shared", "skip"],
      ["@oaslananka/atlas", "publish"],
    ]
  );
});

test("publication plan never downgrades from SRI to a matching SHA-1 digest", async () => {
  const releaseManifest = {
    packages: [
      {
        name: "@oaslananka/shared",
        version: "1.0.0",
        integrity: "sha512-expected",
        shasum: "matching-sha1",
      },
    ],
  };

  await assert.rejects(
    registryPublicationPlan(releaseManifest, async () =>
      response(200, {
        versions: {
          "1.0.0": { dist: { integrity: "sha512-other", shasum: "matching-sha1" } },
        },
      })
    ),
    /different registry integrity/u
  );
});

test("publication plan fails closed when an immutable npm version has different contents", async () => {
  const releaseManifest = {
    packages: [
      {
        name: "@oaslananka/shared",
        version: "1.0.0",
        integrity: "sha512-expected",
        shasum: "expected-sha1",
      },
    ],
  };

  await assert.rejects(
    registryPublicationPlan(releaseManifest, async () =>
      response(200, { versions: { "1.0.0": { dist: { integrity: "sha512-other" } } } })
    ),
    /different registry integrity/u
  );
});

test("npm CLI falls back to lifecycle metadata and fails closed without a trusted path", () => {
  const original = process.env.npm_execpath;
  const expected = resolveNpmCliPath();
  try {
    process.env.npm_execpath = expected;
    assert.equal(resolveNpmCliPath("/missing/node"), expected);
    delete process.env.npm_execpath;
    assert.throws(() => resolveNpmCliPath("/missing/node"), /Unable to locate npm CLI/u);
  } finally {
    if (original === undefined) {
      delete process.env.npm_execpath;
    } else {
      process.env.npm_execpath = original;
    }
  }
});

test("release package loading skips private and non-npm workspaces", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-package-loading-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJson(path.join(root, "release-please-config.json"), {
    packages: {
      "packages/public": {},
      "packages/private": {},
      "packages/other-registry": {},
    },
  });
  await writeJson(path.join(root, ".release-please-manifest.json"), {
    "packages/public": "1.0.0",
    "packages/private": "1.0.0",
    "packages/other-registry": "1.0.0",
  });
  await writeJson(
    path.join(root, "packages/public/package.json"),
    packageJson("@oaslananka/public", { main: "dist/index.js" })
  );
  await writeJson(
    path.join(root, "packages/private/package.json"),
    packageJson("@oaslananka/private", { private: true })
  );
  await writeJson(
    path.join(root, "packages/other-registry/package.json"),
    packageJson("@oaslananka/other-registry", {
      publishConfig: { access: "public", registry: "https://example.invalid/" },
    })
  );

  const packages = await loadExpectedPackages(root);
  assert.deepEqual(
    packages.map((pkg) => pkg.name),
    ["@oaslananka/public"]
  );
});

test("artifact verification rejects missing, malformed, and duplicate checksums", async (t) => {
  await t.test("missing checksum", async () => {
    const fixture = await createFixture();
    try {
      const lines = (await readFile(fixture.checksumsPath, "utf8")).trim().split("\n");
      await writeFile(fixture.checksumsPath, `${lines[0]}\n`, "utf8");
      await assert.rejects(() => verifyFixture(fixture), /missing from SHA256SUMS/u);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("checksum mismatch", async () => {
    const fixture = await createFixture();
    try {
      const content = await readFile(fixture.checksumsPath, "utf8");
      await writeFile(fixture.checksumsPath, content.replace(/^[a-f0-9]{64}/u, "0".repeat(64)));
      await assert.rejects(() => verifyFixture(fixture), /failed SHA-256 verification/u);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("duplicate checksum entry", async () => {
    const fixture = await createFixture();
    try {
      const [first] = (await readFile(fixture.checksumsPath, "utf8")).trim().split("\n");
      await appendFile(fixture.checksumsPath, `${first}\n`, "utf8");
      await assert.rejects(() => verifyFixture(fixture), /Duplicate checksum entry/u);
    } finally {
      await cleanupFixture(fixture);
    }
  });
});

test("artifact verification rejects incomplete and duplicate package sets", async (t) => {
  await t.test("missing package", async () => {
    const fixture = await createFixture();
    try {
      await unlink(fixture.atlasTarball);
      await assert.rejects(() => verifyFixture(fixture), /Missing npm artifacts/u);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("duplicate package", async () => {
    const fixture = await createFixture();
    try {
      const duplicate = path.join(fixture.artifactsDir, "duplicate-atlas.tgz");
      await copyFile(fixture.atlasTarball, duplicate);
      const bytes = await readFile(duplicate);
      await appendFile(
        fixture.checksumsPath,
        `${createHash("sha256").update(bytes).digest("hex")}  artifacts/npm/${path.basename(duplicate)}\n`
      );
      await assert.rejects(() => verifyFixture(fixture), /Duplicate artifact/u);
    } finally {
      await cleanupFixture(fixture);
    }
  });
});

test("artifact verification rejects release metadata and entrypoint drift", async (t) => {
  const cases = [
    [
      "manifest version",
      { atlasExtra: { version: "2.0.0" } },
      /does not match package and release manifest/u,
    ],
    [
      "registry",
      {
        atlasArtifactExtra: {
          publishConfig: { access: "public", registry: "https://example.invalid/" },
        },
      },
      /artifact registry must be/u,
    ],
    [
      "access",
      {
        atlasExtra: {
          publishConfig: { access: "restricted", registry: "https://registry.npmjs.org/" },
        },
      },
      /publish access must be public/u,
    ],
    [
      "repository",
      {
        atlasArtifactExtra: {
          repository: { type: "git", url: "https://example.invalid/repo.git" },
        },
      },
      /repository.url must match/u,
    ],
    [
      "workspace dependency",
      { atlasArtifactExtra: { dependencies: { "@oaslananka/shared": "workspace:*" } } },
      /unresolved workspace dependency/u,
    ],
    [
      "internal version",
      { atlasArtifactExtra: { dependencies: { "@oaslananka/shared": "2.0.0" } } },
      /must resolve to 1.0.0/u,
    ],
    [
      "missing entrypoint",
      { atlasArtifactExtra: { main: "dist/missing.js" } },
      /declared entrypoint/u,
    ],
    [
      "unsafe entrypoint",
      { atlasArtifactExtra: { main: "../outside.js" } },
      /Unsafe package entrypoint/u,
    ],
    ["bad shebang", { atlasCli: "console.log('atlas');\n" }, /missing the Node.js shebang/u],
  ];

  for (const [name, options, expected] of cases) {
    await t.test(name, async () => {
      const fixture = await createFixture(options);
      try {
        await assert.rejects(() => verifyFixture(fixture), expected);
      } finally {
        await cleanupFixture(fixture);
      }
    });
  }
});

test("archive inspection rejects invalid roots, duplicate entries, and malformed package metadata", async (t) => {
  await t.test("invalid root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-invalid-root-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(path.join(root, "outside.txt"), "outside\n");
    const tarball = path.join(root, "invalid-root.tgz");
    execFileSync(SYSTEM_TAR, ["-czf", tarball, "outside.txt"], { cwd: root });
    await assert.rejects(() => inspectTarball(tarball), /unexpected archive root/u);
  });

  await t.test("duplicate entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-duplicate-entry-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeJson(path.join(root, "package/package.json"), packageJson("@oaslananka/shared"));
    const tarball = path.join(root, "duplicate.tgz");
    execFileSync(SYSTEM_TAR, ["-czf", tarball, "package/package.json", "package/package.json"], {
      cwd: root,
    });
    await assert.rejects(() => inspectTarball(tarball), /duplicate archive entries/u);
  });

  await t.test("malformed package.json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-invalid-json-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, "package"), { recursive: true });
    await writeFile(path.join(root, "package/package.json"), "{invalid", "utf8");
    const tarball = path.join(root, "invalid-json.tgz");
    execFileSync(SYSTEM_TAR, ["-czf", tarball, "package"], { cwd: root });
    await assert.rejects(() => inspectTarball(tarball), /contains invalid package.json/u);
  });
});

test("registry checks handle absent versions, errors, retries, and SHA-1 fallback", async () => {
  assert.equal(
    await fetchPublishedVersion("@oaslananka/shared", "1.0.0", async () =>
      response(200, { versions: {} })
    ),
    null
  );
  await assert.rejects(
    () => fetchPublishedVersion("@oaslananka/shared", "1.0.0", async () => response(503, {})),
    /HTTP 503/u
  );

  const artifact = {
    name: "@oaslananka/shared",
    version: "1.0.0",
    integrity: "sha512-expected",
    shasum: "expected-sha1",
  };
  let calls = 0;
  await waitForPublishedIntegrity(artifact, {
    attempts: 2,
    delayMs: 0,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? response(404, {})
        : response(200, { versions: { "1.0.0": { dist: { shasum: "expected-sha1" } } } });
    },
  });
  assert.equal(calls, 2);

  await assert.rejects(
    () =>
      waitForPublishedIntegrity(artifact, {
        attempts: 2,
        delayMs: 0,
        sleep: async () => {},
        fetchImpl: async () => response(404, {}),
      }),
    /did not become available/u
  );
});

test("command execution reports non-zero exits and missing executables", () => {
  assert.throws(
    () => runCommand(process.execPath, ["--eval", "process.exit(7)"], { capture: true }),
    /failed/u
  );
  assert.throws(
    () => runCommand("/definitely/missing/executable", [], { capture: true }),
    /ENOENT/u
  );
});

async function createFixture({
  atlasArtifactExtra = {},
  atlasCli = "#!/usr/bin/env node\nconsole.log('atlas');\n",
  atlasExtra = {},
  atlasSymlink = false,
  omitAtlasDist = false,
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-npm-release-"));
  const artifactsDir = path.join(root, "artifacts", "npm");
  await mkdir(artifactsDir, { recursive: true });
  await writeJson(path.join(root, "release-please-config.json"), {
    packages: {
      "packages/atlas": { "package-name": "@oaslananka/atlas" },
      "packages/shared": { "package-name": "@oaslananka/shared" },
    },
  });
  await writeJson(path.join(root, ".release-please-manifest.json"), {
    "packages/atlas": "1.0.0",
    "packages/shared": "1.0.0",
  });

  const shared = packageJson("@oaslananka/shared", {
    exports: { ".": { import: "./dist/index.js" } },
    main: "dist/index.js",
  });
  const atlas = packageJson("@oaslananka/atlas", {
    main: "dist/index.js",
    bin: { atlas: "./dist/cli.js" },
    dependencies: { "@oaslananka/shared": "1.0.0" },
    ...atlasExtra,
  });
  await writeJson(path.join(root, "packages/shared/package.json"), shared);
  await writeJson(path.join(root, "packages/atlas/package.json"), atlas);

  const sharedTarball = await createTarball(root, artifactsDir, shared, {
    "dist/index.js": "export const shared = true;\n",
  });
  const atlasFiles = omitAtlasDist
    ? { "README.md": "# Atlas\n" }
    : {
        "dist/index.js": atlasSymlink
          ? { symlink: "../../outside.js" }
          : "export const atlas = true;\n",
        "dist/cli.js": atlasCli,
      };
  const atlasTarball = await createTarball(
    root,
    artifactsDir,
    { ...atlas, ...atlasArtifactExtra },
    atlasFiles
  );
  const checksumsPath = path.join(root, "artifacts", "SHA256SUMS.txt");
  const checksums = [];
  for (const file of [sharedTarball, atlasTarball]) {
    const bytes = await readFile(file);
    checksums.push(
      `${createHash("sha256").update(bytes).digest("hex")}  artifacts/npm/${path.basename(file)}`
    );
  }
  await writeFile(checksumsPath, `${checksums.join("\n")}\n`, "utf8");

  return { root, artifactsDir, checksumsPath, atlasTarball, sharedTarball };
}

function verifyFixture(fixture) {
  return verifyNpmArtifacts({
    root: fixture.root,
    artifactsDir: fixture.artifactsDir,
    checksumsPath: fixture.checksumsPath,
  });
}

function cleanupFixture(fixture) {
  return rm(fixture.root, { recursive: true, force: true });
}

async function createTarball(root, artifactsDir, manifest, files) {
  const staging = await mkdtemp(path.join(root, "staging-"));
  const packageDir = path.join(staging, "package");
  await mkdir(packageDir, { recursive: true });
  await writeJson(path.join(packageDir, "package.json"), manifest);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(packageDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    if (typeof content === "object" && content?.symlink) {
      await symlink(content.symlink, target);
    } else {
      await writeFile(target, content, "utf8");
    }
  }

  const filename = `${manifest.name.slice(1).replace("/", "-")}-${manifest.version}.tgz`;
  const target = path.join(artifactsDir, filename);
  execFileSync(SYSTEM_TAR, ["-czf", target, "package"], { cwd: staging });
  await rm(staging, { recursive: true, force: true });
  return target;
}

function packageJson(name, extra) {
  return {
    name,
    version: "1.0.0",
    type: "module",
    repository: {
      type: "git",
      url: "https://github.com/oaslananka/mcp-suite.git",
      directory: `packages/${name.split("/")[1]}`,
    },
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
    files: ["dist", "README.md"],
    dependencies: {},
    ...extra,
  };
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function response(status, value) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return value;
    },
  };
}
