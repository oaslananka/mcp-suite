import { app, BrowserWindow, session } from "electron";
import { createRequire } from "node:module";
import { join } from "path";
import { registerHandlers } from "./ipc/handlers.js";
import { IpcChannel } from "./ipc/channels.js";
import { LabDatabase } from "./storage/db.js";

const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: string | null = null;
const dbPath = join(app.getPath("userData"), "lab.sqlite");
const db = new LabDatabase(dbPath);
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: "MCP Lab",
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedNavigationTarget(targetUrl)) {
      event.preventDefault();
    }
  });

  if (pendingDeepLink) {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send(IpcChannel.DeepLinkOpened, pendingDeepLink);
      pendingDeepLink = null;
    });
  }

  if (process.env["NODE_ENV"] === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  app.setAsDefaultProtocolClient("mcp-lab");
  registerHandlers(db, mainWindow);
  createWindow();
  configureAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("second-instance", (_event, argv) => {
  const deepLinkArg = argv.find((value) => value.startsWith("mcp-lab://"));
  if (deepLinkArg) {
    pendingDeepLink = deepLinkArg;
    mainWindow?.webContents.send(IpcChannel.DeepLinkOpened, deepLinkArg);
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  pendingDeepLink = url;
  mainWindow?.webContents.send(IpcChannel.DeepLinkOpened, url);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  db.close();
});

function configureAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send(IpcChannel.UpdateAvailable, info);
  });

  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send(IpcChannel.UpdateDownloaded, info);
  });

  void autoUpdater.checkForUpdatesAndNotify();
}

function isAllowedNavigationTarget(targetUrl: string): boolean {
  if (process.env["NODE_ENV"] === "development" || !app.isPackaged) {
    return targetUrl.startsWith("http://localhost:5173/");
  }

  return targetUrl.startsWith("file://");
}
