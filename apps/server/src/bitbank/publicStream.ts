import { io, Socket } from "socket.io-client";
import type { Ticker } from "@bitbank-ai-trader/shared";

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
 * bitbank Public Stream(socket.io)に接続し、指定ペアのtickerを購読する。
 * 参照: https://github.com/bitbankinc/bitbank-api-docs/blob/master/public-stream_JP.md
 */
export function subscribeTicker(
  pair: string,
  onTicker: (ticker: Ticker) => void
): Socket {
  const socket = io(STREAM_URL, { transports: ["websocket"] });
  const channel = `ticker_${pair}`;

  socket.on("connect", () => {
    socket.emit("join-room", channel);
  });

  socket.on("message", (raw: unknown) => {
    try {
      const parsed = (
        typeof raw === "string" ? JSON.parse(raw) : raw
      ) as {
        room_name: string;
        message: { data: RawTickerMessage };
      };
      if (parsed.room_name !== channel) return;

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
