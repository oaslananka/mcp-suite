import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import {
  npmCommand,
  registryPublicationPlan,
  resolveNpmCliPath,
  sortPackages,
  verifyNpmArtifacts,
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

async function createFixture({ atlasSymlink = false, omitAtlasDist = false } = {}) {
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

  const shared = packageJson("@oaslananka/shared", { main: "dist/index.js" });
  const atlas = packageJson("@oaslananka/atlas", {
    main: "dist/index.js",
    bin: { atlas: "./dist/cli.js" },
    dependencies: { "@oaslananka/shared": "1.0.0" },
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
        "dist/cli.js": "#!/usr/bin/env node\nconsole.log('atlas');\n",
      };
  const atlasTarball = await createTarball(root, artifactsDir, atlas, atlasFiles);
  const checksumsPath = path.join(root, "artifacts", "SHA256SUMS.txt");
  const checksums = [];
  for (const file of [sharedTarball, atlasTarball]) {
    const bytes = await readFile(file);
    checksums.push(
      `${createHash("sha256").update(bytes).digest("hex")}  artifacts/npm/${path.basename(file)}`
    );
  }
  await writeFile(checksumsPath, `${checksums.join("\n")}\n`, "utf8");

  return { root, artifactsDir, checksumsPath };
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
  execFileSync("tar", ["-czf", target, "package"], { cwd: staging });
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
