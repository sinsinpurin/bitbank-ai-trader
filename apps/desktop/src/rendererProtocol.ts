import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";

export const RENDERER_SCHEME = "app";
export const APP_RENDERER_URL = `${RENDERER_SCHEME}://noctas/`;

// dist/main.js から見て apps/desktop/renderer
const rendererRoot = path.join(__dirname, "..", "renderer");

// app:// を http と同等の特権 (fetch/WebSocket/Service Worker等) で扱わせる。
// secure: true でも Chromium のループバック例外により http://127.0.0.1:4000 への
// 接続は mixed content としてブロックされない。
export function registerRendererProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: RENDERER_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

// URLパスを renderer ディレクトリ配下の実ファイルへ解決する。
// 配下から出るパスは、normalize後の `..` 検出と path.relative での二重チェックで拒否する。
function resolveWithinRoot(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const normalized = path.normalize(decoded.replace(/^\/+/, ""));
  if (normalized.split(/[\\/]/).includes("..")) return null;

  const resolved = path.resolve(rendererRoot, normalized);
  const relative = path.relative(rendererRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

  return resolved;
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

// trailingSlash: true の書き出し形 (/chart -> chart/index.html) に合わせて、
// 末尾スラッシュや拡張子なしのパスはディレクトリ内の index.html を探す。
function resolveFile(urlPath: string): string | null {
  const base = resolveWithinRoot(urlPath);
  if (!base) return null;

  const endsWithSlash = urlPath.endsWith("/");
  const hasExtension = path.extname(base) !== "";

  if (!endsWithSlash && hasExtension) {
    return isFile(base) ? base : null;
  }

  const indexPath = path.join(base, "index.html");
  if (isFile(indexPath)) return indexPath;
  if (!endsWithSlash && isFile(base)) return base;
  if (!endsWithSlash && isFile(`${base}.html`)) return `${base}.html`;
  return null;
}

// renderer/ は `npm run build:desktop:renderer` の成果物で gitignore 対象のため、
// 未生成のまま起動すると app:// が全て404を返し、白紙の "Not Found" 画面になる。
// 静かに壊れるのを防ぐため、起動前に呼び出し元でチェックさせる。
export function hasRendererBuild(): boolean {
  return isFile(path.join(rendererRoot, "index.html"));
}

export function registerRendererProtocolHandler(): void {
  protocol.handle(RENDERER_SCHEME, async (request) => {
    const filePath = resolveFile(new URL(request.url).pathname);
    if (!filePath) {
      return new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
