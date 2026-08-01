import { execFile } from "node:child_process";
import net from "node:net";
import { dialog } from "electron";
import { SERVER_PORT, HEALTH_URL, isServerHealthy } from "./serverProcess";

const PORT_FREE_TIMEOUT_MS = 5_000;
const PORT_POLL_INTERVAL_MS = 100;

export type PortGuardDecision = "start-server" | "attach-existing" | "abort";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOccupied(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: SERVER_PORT });
    const finish = (occupied: boolean) => {
      socket.destroy();
      resolve(occupied);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function execFileAsync(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (_err, stdout) => resolve(stdout ?? ""));
  });
}

async function findListeningPid(): Promise<number | null> {
  if (process.platform === "win32") {
    const stdout = await execFileAsync("netstat", ["-ano"]);
    for (const line of stdout.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5 || parts[3] !== "LISTENING") continue;
      if (!parts[1].endsWith(`:${SERVER_PORT}`)) continue;
      const pid = Number(parts[4]);
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
    return null;
  }
  const stdout = await execFileAsync("lsof", ["-ti", `tcp:${SERVER_PORT}`, "-sTCP:LISTEN"]);
  const pid = Number(stdout.trim().split(/\s+/)[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function killPid(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await execFileAsync("taskkill", ["/pid", String(pid), "/T", "/F"]);
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // すでに終了している
  }
}

async function waitForPortFree(): Promise<boolean> {
  const deadline = Date.now() + PORT_FREE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await isPortOccupied())) return true;
    await delay(PORT_POLL_INTERVAL_MS);
  }
  return false;
}

// 別ポートへのフォールバックは行わない。レンダラーが参照するURLはビルド時固定のため、
// サーバーだけ別ポートに逃がしても画面からは繋がらない。
export async function guardServerPort(): Promise<PortGuardDecision> {
  if (await isServerHealthy()) {
    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["既存のサーバーに接続する", "終了して再起動する", "キャンセル"],
      defaultId: 0,
      cancelId: 2,
      title: "Noctas サーバーは既に起動しています",
      message: `ポート ${SERVER_PORT} で Noctas サーバーが応答しています。`,
      detail: `${HEALTH_URL} が 200 を返しました。既存のサーバーをそのまま使うか、終了して新しく起動し直すか選んでください。`,
    });

    if (response === 0) return "attach-existing";
    if (response === 2) return "abort";

    const pid = await findListeningPid();
    if (pid === null) {
      dialog.showErrorBox(
        "既存サーバーを終了できません",
        `ポート ${SERVER_PORT} を使用しているプロセスのPIDを特定できませんでした。手動で終了してから再度起動してください。`
      );
      return "abort";
    }
    await killPid(pid);
    if (!(await waitForPortFree())) {
      dialog.showErrorBox(
        "ポートが解放されません",
        `PID ${pid} を終了しましたが、ポート ${SERVER_PORT} が解放されませんでした。手動で確認してください。`
      );
      return "abort";
    }
    return "start-server";
  }

  if (await isPortOccupied()) {
    const pid = await findListeningPid();
    dialog.showErrorBox(
      "ポートが使用中です",
      `ポート ${SERVER_PORT} は Noctas 以外のプロセスに使用されています${
        pid === null ? "" : ` (PID ${pid})`
      }。\n${HEALTH_URL} は応答しませんでした。該当プロセスを終了してから起動し直してください。`
    );
    return "abort";
  }

  return "start-server";
}
