import { app, dialog, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

export function initAutoUpdater(
  win: BrowserWindow,
  stopAllProcesses: () => Promise<void>
): void {
  // 開発時は更新フィードが存在せず、チェックが必ず失敗するだけなので何もしない。
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  // 終了時の自動インストールはしない。建玉を持ったまま動いているBotのプロセスが
  // ユーザーの意図しないタイミングで入れ替わるのを避ける。
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-downloaded", (info) => {
    // 終了処理中にダウンロードが完了するとウィンドウが既に破棄されていることがある。
    if (win.isDestroyed()) return;

    void dialog
      .showMessageBox(win, {
        type: "info",
        buttons: ["今すぐ再起動して更新", "後で"],
        defaultId: 0,
        cancelId: 1,
        title: "Noctas の更新が準備できました",
        message: `バージョン ${info.version} のダウンロードが完了しました。`,
        detail:
          "再起動すると更新が適用されます。保有中のポジションや設定は保持されますが、" +
          "更新中はBot戦略の評価が停止します。",
      })
      .then(async ({ response }) => {
        if (response !== 0) return;
        // quitAndInstall() はNSISインストーラーを先に同期起動してから app.quit() するため、
        // before-quit のグレースフル停止では間に合わない。インストーラーは実行中の
        // Noctas.exe を名前で強制終了するが、サーバーの子プロセスも ELECTRON_RUN_AS_NODE で
        // 同じ実行ファイルとして動いているため巻き添えになり、書き込み途中の
        // ペーパートレードが失われうる。先に自分でサーバーを止めておく。
        await stopAllProcesses();
        autoUpdater.quitAndInstall();
      })
      .catch((err: unknown) => {
        console.error(
          `[updater] 更新の適用に失敗しました: ${err instanceof Error ? err.message : String(err)}`
        );
      });
  });

  // 他の起動時エラーと違い、ここではダイアログを出さない。オフラインや更新サーバー側の
  // 一時的な失敗で、稼働中のBotをモーダルで止めてしまうのは割に合わない。
  autoUpdater.on("error", (err) => {
    console.error(`[updater] 更新の確認に失敗しました: ${err.message}`);
  });

  // 公開済みReleaseがまだ無い間 (draft運用では通常の状態) は必ず reject するため、
  // ここで握りつぶす。内容のログ出力は上の error ハンドラが担当する。
  void autoUpdater.checkForUpdates().catch(() => {});
}
