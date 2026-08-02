import type { NextConfig } from "next";

// Electron版が管理する next dev は、手動の `npm run dev` と同じ .next を共有すると
// 成果物が壊れるため、専用のdistDirへ隔離する。未設定時は通常の .next を使う。
const desktopDistDir = process.env.NOCTAS_DESKTOP_WEB_DISTDIR;

// Electron向けの静的書き出し (app:// で配信する out/ を生成する)。
// output: "export" 時は distDir が「静的出力先」の意味に変わり、
// 中間成果物は強制的に .next へ書かれるため、distDir分岐とは併用できない。
// 事故防止として export を優先し、distDirは無視する。
const desktopExport = process.env.NOCTAS_DESKTOP_WEB_EXPORT === "1";

const nextConfig: NextConfig = desktopExport
  ? {
      output: "export",
      // /chart -> chart/index.html になり、app:// 側のディレクトリindex解決と噛み合う。
      trailingSlash: true,
    }
  : {
      ...(desktopDistDir ? { distDir: desktopDistDir } : {}),
    };

export default nextConfig;
