import { mkdir } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_PLAYGROUND_DIR = "data/playground";
const LATENCY_SERIES = [92, 104, 118, 133, 149, 176, 212];
const TOOL_NAME = "atlas.search";

const [targetDir = DEFAULT_PLAYGROUND_DIR] = process.argv.slice(2);
const playgroundDir = path.resolve(targetDir);

const atlas = await importBuiltPackage("../packages/atlas/dist/index.js", "@oaslananka/atlas");
const observatory = await importBuiltPackage(
  "../packages/observatory/dist/index.js",
  "@oaslananka/observatory"
);

await mkdir(playgroundDir, { recursive: true });
seedAtlas(path.join(playgroundDir, "atlas.sqlite"));
seedObservatoryDatabase(path.join(playgroundDir, "observatory.sqlite"));

console.log(`Seeded playground data in ${playgroundDir}`);

async function importBuiltPackage(relativePath, packageName) {
  try {
    return await import(new URL(relativePath, import.meta.url).href);
  } catch (error) {
    throw new Error(`Run pnpm build before seeding the ${packageName} playground data.`, {
      cause: error,
    });
  }
}

function seedAtlas(databasePath) {
  const db = new Database(databasePath);
  try {
    new atlas.ServerStore(db).seed(atlas.SEED_SERVERS);
  } finally {
    db.close();
  }
}

function seedObservatoryDatabase(databasePath) {
  const db = new Database(databasePath);
  try {
    seedObservatory(new observatory.SQLiteStore(db), db);
  } finally {
    db.close();
  }
}

function seedObservatory(store, db, now = Date.now()) {
  db.exec("DELETE FROM metrics; DELETE FROM spans; DELETE FROM alerts;");

  LATENCY_SERIES.forEach((latency, index) => {
    const timestamp = minutesAgo(now, LATENCY_SERIES.length - index);
    store.insertMetric({ name: "latency", value: latency, timestamp, toolName: TOOL_NAME });
    store.insertMetric({ name: "calls", value: 1, timestamp, toolName: TOOL_NAME });
  });

  store.insertMetric({
    name: "errors",
    value: 1,
    timestamp: minutesAgo(now, 1),
    toolName: TOOL_NAME,
  });
  store.insertSpan({
    traceId: "playground-trace",
    spanId: "atlas-search",
    name: "atlas.search",
    startTime: minutesAgo(now, 2),
    endTime: minutesAgo(now, 1),
    attributes: { query: "github", surface: "playground" },
  });
  store.insertAlert({
    id: "playground-latency-warning",
    severity: "warning",
    title: "Playground latency warning",
    message: "Seeded alert for validating the Observatory alerts view.",
    metric: "latency",
    createdAt: minutesAgo(now, 1),
  });
}

function minutesAgo(now, minutes) {
  return new Date(now - minutes * 60_000).toISOString();
}
