import type { Metadata } from "next";
import { Orbitron, Rajdhani } from "next/font/google";
import { Provider } from "@/components/ui/provider";
import "./globals.css";

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  display: "swap",
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bitbank AI Trader",
  description: "Claude搭載のAI売買判断ダッシュボード(ペーパートレード)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${orbitron.variable} ${rajdhani.variable}`}
    >
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
