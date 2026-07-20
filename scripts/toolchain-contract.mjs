import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ACTIVE_CONFIG_ROOTS = [".github", ".azure", ".devcontainer"];
const ACTIVE_CONFIG_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);

function normalizeVersion(version) {
  return String(version).trim().replace(/^v/, "");
}

function versionLine(version) {
  const [major, minor] = version.split(".");
  return `${major}.${minor}.x`;
}

export function readToolVersions(text) {
  const contract = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const commentIndex = rawLine.indexOf("#");
    const line = (commentIndex === -1 ? rawLine : rawLine.slice(0, commentIndex)).trim();
    if (!line) continue;

    const [tool, version, ...extra] = line.split(/\s+/);
    if (!tool || !version || extra.length > 0) {
      throw new Error(`Invalid .tool-versions line: ${rawLine}`);
    }
    if (Object.hasOwn(contract, tool)) {
      throw new Error(`Duplicate tool in .tool-versions: ${tool}`);
    }
    contract[tool] = normalizeVersion(version);
  }

  for (const requiredTool of ["node", "pnpm"]) {
    if (!contract[requiredTool]) {
      throw new Error(`Missing ${requiredTool} entry in .tool-versions`);
    }
  }

  return { node: contract.node, pnpm: contract.pnpm };
}

export function resolvePnpmVersion({ declaredVersion = "", userAgent = "" } = {}) {
  const explicitVersion = normalizeVersion(declaredVersion);
  if (explicitVersion) return explicitVersion;

  for (const token of String(userAgent).trim().split(/\s+/)) {
    if (token.startsWith("pnpm/") && token.length > "pnpm/".length) {
      return normalizeVersion(token.slice("pnpm/".length));
    }
  }

  throw new Error(
    "Unable to determine pnpm version without executing a PATH-resolved command; run through pnpm or set TOOLCHAIN_PNPM_VERSION"
  );
}

export function assertExactVersion(actual, expected, label) {
  const normalizedActual = normalizeVersion(actual);
  const normalizedExpected = normalizeVersion(expected);

  if (normalizedActual !== normalizedExpected) {
    throw new Error(
      `${label} version mismatch: expected ${normalizedExpected}, received ${normalizedActual}`
    );
  }
}

function findForbiddenRuntimeSelections(files) {
  const forbiddenPatterns = [
    /\bnode-version:\s*["']?(?:20|22)(?:\.[0-9x*]+)*/i,
    /\bNODE_VERSION:\s*["']?(?:20|22)(?:\.[0-9x*]+)*/i,
    /typescript-node:(?:[^"'\s]*[-:])?(?:20|22)(?=[-.:"'\s]|$)/i,
    /\bFROM\s+node:(?:20|22)(?=[-.@:\s]|$)/i,
  ];

  return [...files.entries()]
    .filter(([, content]) => forbiddenPatterns.some((pattern) => pattern.test(content)))
    .map(([path]) => path)
    .sort((left, right) => left.localeCompare(right));
}

function findNoncanonicalPnpmSelections(files, expectedVersion) {
  const mismatches = [];
  const pattern = /\bcorepack\s+prepare\s+["']?pnpm@(\d+\.\d+\.\d+)/gi;

  for (const [path, content] of files.entries()) {
    for (const match of content.matchAll(pattern)) {
      if (match[1] !== expectedVersion) {
        mismatches.push(`${path} uses pnpm ${match[1]}; expected ${expectedVersion}`);
      }
    }
  }

  return mismatches.sort((left, right) => left.localeCompare(right));
}

export function validateRepositorySnapshot(snapshot, contract) {
  const errors = [];
  const expectedPackageManager = `pnpm@${contract.pnpm}`;
  const expectedNodeEngine = versionLine(contract.node);
  const expectedPnpmEngine = versionLine(contract.pnpm);

  if (snapshot.packageJson.packageManager !== expectedPackageManager) {
    errors.push(
      `package.json packageManager must be ${expectedPackageManager}, received ${snapshot.packageJson.packageManager ?? "missing"}`
    );
  }
  if (snapshot.packageJson.engines?.node !== expectedNodeEngine) {
    errors.push(
      `package.json engines.node must be ${expectedNodeEngine}, received ${snapshot.packageJson.engines?.node ?? "missing"}`
    );
  }
  if (snapshot.packageJson.engines?.pnpm !== expectedPnpmEngine) {
    errors.push(
      `package.json engines.pnpm must be ${expectedPnpmEngine}, received ${snapshot.packageJson.engines?.pnpm ?? "missing"}`
    );
  }

  const forbiddenSelections = findForbiddenRuntimeSelections(snapshot.files);
  if (forbiddenSelections.length > 0) {
    errors.push(
      `Node 20 or Node 22 selection found in active configuration: ${forbiddenSelections.join(", ")}`
    );
  }

  const pnpmMismatches = findNoncanonicalPnpmSelections(snapshot.files, contract.pnpm);
  if (pnpmMismatches.length > 0) {
    errors.push(`Noncanonical pnpm selection: ${pnpmMismatches.join(", ")}`);
  }

  if (errors.length > 0) {
    throw new Error(`Repository toolchain contract failed:\n- ${errors.join("\n- ")}`);
  }
}

function collectConfigFiles(rootDir) {
  const files = new Map();

  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const absolutePath = join(path, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      const extension = entry.name.slice(entry.name.lastIndexOf("."));
      if (!ACTIVE_CONFIG_EXTENSIONS.has(extension)) continue;
      files.set(relative(rootDir, absolutePath), readFileSync(absolutePath, "utf8"));
    }
  }

  for (const configRoot of ACTIVE_CONFIG_ROOTS) {
    const absoluteRoot = join(rootDir, configRoot);
    if (existsSync(absoluteRoot)) visit(absoluteRoot);
  }

  for (const composeFile of ["docker-compose.yml", "docker-compose.prod.yml"]) {
    const absolutePath = join(rootDir, composeFile);
    if (existsSync(absolutePath)) {
      files.set(composeFile, readFileSync(absolutePath, "utf8"));
    }
  }

  const packagesRoot = join(rootDir, "packages");
  if (existsSync(packagesRoot)) {
    for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dockerfile = join(packagesRoot, entry.name, "Dockerfile");
      if (existsSync(dockerfile)) {
        files.set(relative(rootDir, dockerfile), readFileSync(dockerfile, "utf8"));
      }
    }
  }

  return files;
}

export function readRepositoryContract(rootDir) {
  return readToolVersions(readFileSync(join(rootDir, ".tool-versions"), "utf8"));
}

export function validateRepository(rootDir, contract = readRepositoryContract(rootDir)) {
  const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  validateRepositorySnapshot(
    {
      packageJson,
      files: collectConfigFiles(rootDir),
    },
    contract
  );
}
