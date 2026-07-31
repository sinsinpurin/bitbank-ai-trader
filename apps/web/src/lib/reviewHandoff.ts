const STORAGE_KEY = "noctas:pending-review-context";

/**
 * P&L ReportのAI Reviewの結果をBot Blueprint(AI Strategy Gen)へ引き継ぐための
 * ページをまたいだ一時受け渡し。ページ間でReactの状態を共有していないため、
 * タブを閉じると消えるsessionStorageで橋渡しする。
 */
export function stashReviewContext(review: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, review);
}

/** 引き継がれたレビュー内容を取り出す。取り出した時点で消費済みとして削除する(再訪問時に再適用されないように) */
export function takePendingReviewContext(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(STORAGE_KEY);
  if (value !== null) window.sessionStorage.removeItem(STORAGE_KEY);
  return value;
}
