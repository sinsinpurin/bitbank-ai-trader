import type { Metadata } from "next";
import { Chakra_Petch, Inter, JetBrains_Mono } from "next/font/google";
import { Provider } from "@/components/ui/provider";
import "./globals.css";

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra-petch",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      className={`${chakraPetch.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
