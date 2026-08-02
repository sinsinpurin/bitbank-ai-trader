// リリースタグ (vX.Y.Z) と apps/desktop/package.json の version が
// 一致していることを検証する。バージョンはCIで書き換えず、人間がコミットしたものを
// そのまま使う方針なので、ズレていたら黙って別バージョンを出さずここで止める。
// プレフィックスは electron-builder がReleaseに付けるタグ ("v<version>") と揃えている。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(__dirname, "..", "package.json");

const TAG_PREFIX = "v";

const ref = process.env.GITHUB_REF_NAME;
if (!ref) {
  console.error(
    "GITHUB_REF_NAME が設定されていません。このスクリプトはタグpush時のCIから実行してください。"
  );
  process.exit(1);
}

if (!ref.startsWith(TAG_PREFIX)) {
  console.error(
    `タグ名 "${ref}" が想定の形式ではありません。"${TAG_PREFIX}X.Y.Z" の形式で打ち直してください。`
  );
  process.exit(1);
}

const tagVersion = ref.slice(TAG_PREFIX.length);
const packageVersion = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;

if (tagVersion !== packageVersion) {
  console.error(
    `バージョンが一致しません。\n` +
      `  タグ: ${ref} (=> ${tagVersion})\n` +
      `  apps/desktop/package.json: ${packageVersion}\n` +
      `apps/desktop/package.json の version を ${tagVersion} に更新してコミットしてから、` +
      `タグを打ち直してください。`
  );
  process.exit(1);
}

console.log(`[check-release-version] OK: ${ref} == apps/desktop/package.json ${packageVersion}`);
