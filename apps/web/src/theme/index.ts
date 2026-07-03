import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * Cyberpsycho UI — design/cyberpunk-edgerunners-design-system.md 準拠のテーマトークン。
 * ネオンは意味を運ぶ: 赤=危険/主要操作、シアン=情報/副操作、黄=強調(1画面に一点のみ)、
 * 緑=安全/成功、橙=注意。角丸は使わずノッチ(clip-path)で表現する。
 */
const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        bg: {
          void: { value: "#0A0A0D" },
          surface: { value: "#131318" },
          surfaceRaised: { value: "#1C1C24" },
        },
        border: {
          grid: { value: "rgba(255,0,60,0.22)" },
          gridCyan: { value: "rgba(0,229,255,0.22)" },
        },
        signal: {
          red: { value: "#FF003C" },
          redDim: { value: "#B4002A" },
          cyan: { value: "#00E5FF" },
          cyanDim: { value: "#00A8BC" },
          yellow: { value: "#FCEE0A" },
          green: { value: "#39FF88" },
          orange: { value: "#FF8A1E" },
        },
        text: {
          primary: { value: "#F2F2F5" },
          secondary: { value: "#9A9AA6" },
          disabled: { value: "#4B4B55" },
          onSignal: { value: "#0A0A0D" },
        },
      },
      fonts: {
        heading: { value: "var(--font-chakra-petch), sans-serif" },
        body: { value: "var(--font-inter), sans-serif" },
        mono: { value: "var(--font-jetbrains-mono), monospace" },
      },
      shadows: {
        glowRedSm: { value: "0 0 6px rgba(255,0,60,.55)" },
        glowRedLg: { value: "0 0 6px rgba(255,0,60,.6), 0 0 28px rgba(255,0,60,.25)" },
        glowCyanSm: { value: "0 0 6px rgba(0,229,255,.55)" },
        glowCyanLg: { value: "0 0 6px rgba(0,229,255,.6), 0 0 28px rgba(0,229,255,.25)" },
        elevationPanel: { value: "0 4px 24px rgba(0,0,0,.6)" },
      },
      durations: {
        fast: { value: "120ms" },
        base: { value: "240ms" },
        slow: { value: "480ms" },
      },
      easings: {
        standard: { value: "cubic-bezier(.16,1,.3,1)" },
      },
    },
  },
});

/** ノッチ(切り欠き角)。radius/none が基本で、代わりに一部の角を斜めにカットする */
export const notch = {
  sm: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)",
  md: "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)",
  lg: "polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px)",
};

export const system = createSystem(defaultConfig, config);
