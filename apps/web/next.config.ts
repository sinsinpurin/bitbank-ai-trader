import type { NextConfig } from "next";

// Electron版が管理する next dev は、手動の `npm run dev` と同じ .next を共有すると
// 成果物が壊れるため、専用のdistDirへ隔離する。未設定時は通常の .next を使う。
const desktopDistDir = process.env.NOCTAS_DESKTOP_WEB_DISTDIR;

const nextConfig: NextConfig = {
  ...(desktopDistDir ? { distDir: desktopDistDir } : {}),
};

export default nextConfig;
