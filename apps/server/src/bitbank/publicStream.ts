import { io, Socket } from "socket.io-client";
import type { Ticker } from "@noctas/shared";

const STREAM_URL = "wss://stream.bitbank.cc";

interface RawTickerMessage {
  sell: string;
  buy: string;
  high: string;
  low: string;
  last: string;
  vol: string;
  timestamp: number;
}

/**
 * bitbank Public Stream(socket.io)に接続し、複数ペアのtickerを1つのソケットで購読する。
 * 参照: https://github.com/bitbankinc/bitbank-api-docs/blob/master/public-stream_JP.md
 */
export function subscribeTickers(
  pairs: string[],
  onTicker: (ticker: Ticker) => void
): Socket {
  const socket = io(STREAM_URL, { transports: ["websocket"] });
  // room_name("ticker_btc_jpy")→ペアの逆引き
  const pairByChannel = new Map(pairs.map((pair) => [`ticker_${pair}`, pair]));

  socket.on("connect", () => {
    for (const channel of pairByChannel.keys()) {
      socket.emit("join-room", channel);
    }
    console.info(`[publicStream] ${pairs.join(", ")} のtickerを購読しました`);
  });

  socket.on("message", (raw: unknown) => {
    try {
      const parsed = (
        typeof raw === "string" ? JSON.parse(raw) : raw
      ) as {
        room_name: string;
        message: { data: RawTickerMessage };
      };
      const pair = pairByChannel.get(parsed.room_name);
      if (!pair) return;

      const data = parsed.message.data;
      onTicker({
        pair,
        sell: Number(data.sell),
        buy: Number(data.buy),
        high: Number(data.high),
        low: Number(data.low),
        last: Number(data.last),
        vol: Number(data.vol),
        timestamp: data.timestamp,
      });
    } catch (err) {
      console.error("[publicStream] メッセージ解析エラー", err);
    }
  });

  socket.on("connect_error", (err) => {
    console.error("[publicStream] 接続エラー", err.message);
  });

  return socket;
}
