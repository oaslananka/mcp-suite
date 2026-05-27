import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const HOST = "127.0.0.1";
const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);

const [directory, portValue] = process.argv.slice(2);

if (!directory || !portValue) {
  throw new Error("Usage: node scripts/serve-static.mjs <directory> <port>");
}

const root = path.resolve(directory);
const port = Number.parseInt(portValue, 10);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid port: ${portValue}`);
}

if (!existsSync(root)) {
  throw new Error(`Static directory does not exist: ${root}`);
}

const server = createServer((request, response) => {
  handleRequest(request.url ?? "/", response).catch((error) => {
    console.error(
      `Static request failed: ${error instanceof Error ? error.message : String(error)}`
    );
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }
    response.end("Static request failed");
  });
});

server.listen(port, HOST, () => {
  console.log(`Serving ${root} at http://${HOST}:${port}`);
});

process.on("SIGTERM", closeServer);
process.on("SIGINT", closeServer);

async function handleRequest(rawUrl, response) {
  const filePath = await resolveFile(rawUrl);

  if (!filePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const stream = createReadStream(filePath);
  stream.on("error", (error) => {
    console.error(`Unable to read static asset ${filePath}: ${error.message}`);
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }
    response.end("Unable to read asset");
  });

  response.writeHead(200, {
    "content-type": CONTENT_TYPES.get(path.extname(filePath)) ?? "application/octet-stream",
  });
  stream.pipe(response);
}

async function resolveFile(rawUrl) {
  const parsed = new URL(rawUrl, `http://${HOST}`);
  const pathname = decodeURIComponent(parsed.pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = path.resolve(root, `.${requestedPath}`);

  if (isInsideRoot(candidate)) {
    try {
      const candidateStat = await stat(candidate);
      if (candidateStat.isFile()) {
        return candidate;
      }
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
      return resolveIndex();
    }
  }

  return resolveIndex();
}

async function resolveIndex() {
  const indexPath = path.join(root, "index.html");

  try {
    const indexStat = await stat(indexPath);
    return indexStat.isFile() ? indexPath : undefined;
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
    return undefined;
  }
}

function isInsideRoot(candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isMissingPathError(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

function closeServer() {
  server.close(() => process.exit(0));
}
