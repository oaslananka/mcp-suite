const { spawn, spawnSync } = require("child_process");
const { existsSync } = require("fs");
const { join } = require("path");

function resolveWindowsPackageManagerCommand(name) {
  const whereResult = spawnSync("where", [`${name}.cmd`], {
    windowsHide: true,
    encoding: "utf8",
    shell: true,
  });

  const first = whereResult.stdout
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && existsSync(line));
  if (first) return first;

  const candidates = [
    join(process.env["ProgramFiles"] || "C:\\Program Files", "nodejs", `${name}.cmd`),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs", `${name}.cmd`),
    join(process.env["LOCALAPPDATA"] || "", "Programs", "nodejs", `${name}.cmd`),
    join(process.env["APPDATA"] || "", "npm", `${name}.cmd`),
  ];

  return candidates.find((candidate) => candidate.length > 0 && existsSync(candidate));
}

function resolveStdioCommand(command) {
  if (process.platform !== "win32") return command;
  const normalized = command.trim();
  const lower = normalized.toLowerCase();
  if (lower === "npx" || lower === "npm" || lower === "pnpm") {
    return resolveWindowsPackageManagerCommand(lower) || normalized;
  }
  return normalized;
}

function quoteWindowsCmdArg(value) {
  const text = value.trim();
  if (text.length === 0) return '""';
  if (!/[\s"&|<>^]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildWindowsCommandLine(command, args) {
  return [command, ...args].map(quoteWindowsCmdArg).join(" ");
}

function withWindowsCommandPath(env) {
  if (process.platform !== "win32") return env;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "Path";
  const currentPath = env[pathKey] || "";
  const extras = [
    join(process.env["ProgramFiles"] || "C:\\Program Files", "nodejs"),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs"),
    join(process.env["LOCALAPPDATA"] || "", "Programs", "nodejs"),
    join(process.env["APPDATA"] || "", "npm"),
  ].filter(Boolean);
  const merged = Array.from(new Set([...extras, ...currentPath.split(";").filter(Boolean)]));
  return { ...env, [pathKey]: merged.join(";") };
}

const originalCommand = "npx";
const args = ["-y", "@modelcontextprotocol/server-filesystem", "."];
const resolved = resolveStdioCommand(originalCommand);
const env = withWindowsCommandPath(process.env);
const useCmd = process.platform === "win32" && ["npx", "npm", "pnpm"].includes(originalCommand.toLowerCase());

let child;
if (useCmd) {
  const line = buildWindowsCommandLine(resolved, args);
  console.log("spawn:", "cmd.exe", ["/d", "/s", "/c", line]);
  child = spawn("cmd.exe", ["/d", "/s", "/c", line], { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
} else {
  console.log("spawn:", resolved, args);
  child = spawn(resolved, args, { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
}

let stderrBuffer = "";
child.stdout.on("data", (d) => {
  console.log("STDOUT:", d.toString("utf8"));
});
child.stderr.on("data", (d) => {
  const text = d.toString("utf8");
  stderrBuffer += text;
  console.log("STDERR:", text);
});
child.on("error", (err) => {
  console.error("SPAWN_ERROR:", err);
});
child.on("exit", (code, signal) => {
  console.log("EXIT:", { code, signal, stderrBuffer: stderrBuffer.trim() });
});

setTimeout(() => {
  const initReq = {
    jsonrpc: "2.0",
    id: "debug-init",
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      clientInfo: { name: "debug-client", version: "1.0.0" },
      capabilities: {},
    },
  };
  child.stdin.write(JSON.stringify(initReq) + "\n");
  console.log("WROTE_INITIALIZE");
}, 1000);

setTimeout(() => {
  if (!child.killed) {
    child.kill();
    console.log("KILLED_CHILD_AFTER_TIMEOUT");
  }
}, 10000);
