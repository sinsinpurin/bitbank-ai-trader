/** AIコスト表示用。少額(100円未満)は小数2桁まで表示する */
export function formatCostJpy(value: number) {
  if (Math.abs(value) < 100) {
    return `¥${value.toFixed(2)}`;
  }
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}
