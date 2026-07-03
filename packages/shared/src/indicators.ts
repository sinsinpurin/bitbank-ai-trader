/**
 * テクニカルインジケーターの計算。
 * すべて入力シリーズと同じ長さの配列を返し、計算に必要な履歴が足りない区間は NaN で埋める。
 */

export function sma(values: number[], period: number): number[] {
  const result = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return result;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

export function ema(values: number[], period: number): number[] {
  const result = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return result;

  // 最初のEMAはSMAで初期化する
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let prev = sum / period;
  result[period - 1] = prev;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}

/** Wilder方式のRSI(0-100) */
export function rsi(values: number[], period: number): number[] {
  const result = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}
