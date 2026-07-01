import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        bg: {
          canvas: { value: "#05050a" },
          panel: { value: "#0b0c14" },
          panelAlt: { value: "#11121d" },
        },
        neon: {
          cyan: { value: "#00fff0" },
          magenta: { value: "#ff2ee6" },
          violet: { value: "#7b5bff" },
          green: { value: "#39ff88" },
          red: { value: "#ff3860" },
          yellow: { value: "#ffd23f" },
        },
      },
      fonts: {
        heading: { value: "var(--font-orbitron), sans-serif" },
        body: { value: "var(--font-rajdhani), sans-serif" },
      },
      shadows: {
        glowCyan: { value: "0 0 12px rgba(0,255,240,0.55), 0 0 2px rgba(0,255,240,0.8)" },
        glowMagenta: { value: "0 0 12px rgba(255,46,230,0.5), 0 0 2px rgba(255,46,230,0.8)" },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
