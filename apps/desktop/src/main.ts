import path from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";
import { guardServerPort } from "./portGuard";
import {
  startServerProcess,
  stopServerProcess,
  forceKillServerProcessSync,
} from "./serverProcess";
import { startWebProcess, stopWebProcess, forceKillWebProcessSync } from "./webProcess";

const WEB_PORT = Number(process.env.NOCTAS_DESKTOP_WEB_PORT ?? 3000);
const RENDERER_URL = process.env.NOCTAS_DESKTOP_RENDERER ?? `http://localhost:${WEB_PORT}`;
// Phase 2 で静的書き出しに切り替えた際に next dev を誤って起動しないよう、
// 明示的にオプトインした開発時 (npm run dev:desktop) だけ web を管理する。
const MANAGE_WEB = process.env.NOCTAS_DESKTOP_MANAGE_WEB === "1";

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let loadRetried = false;

// 片方の停止が失敗しても、もう片方は必ず試行する。
async function stopAllProcesses(): Promise<void> {
  await Promise.allSettled([stopWebProcess(), stopServerProcess()]);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#05070d",
    title: "Noctas",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // web開発サーバーの listen 直後はまだ接続を取りこぼすことがあるため、一度だけ再試行する。
  mainWindow.webContents.on("did-fail-load", (_event, _code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || loadRetried || quitting) return;
    loadRetried = true;
    setTimeout(() => {
      void mainWindow?.loadURL(RENDERER_URL);
    }, 1_000);
  });

  void mainWindow.loadURL(RENDERER_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const decision = await guardServerPort();
    if (decision === "abort") {
      app.quit();
      return;
    }

    if (decision === "start-server") {
      try {
        await startServerProcess();
      } catch (err) {
        dialog.showErrorBox(
          "Noctas サーバーを起動できません",
          err instanceof Error ? err.message : String(err)
        );
        app.quit();
        return;
      }
    }

    if (MANAGE_WEB) {
      try {
        await startWebProcess();
      } catch (err) {
        dialog.showErrorBox(
          "Noctas web開発サーバーを起動できません",
          err instanceof Error ? err.message : String(err)
        );
        await stopAllProcesses();
        app.quit();
        return;
      }
    }

    createWindow();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void stopAllProcesses().finally(() => app.quit());
  });

  process.on("exit", () => {
    forceKillWebProcessSync();
    forceKillServerProcessSync();
  });
}
