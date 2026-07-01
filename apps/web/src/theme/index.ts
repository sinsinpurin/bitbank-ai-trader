import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        // Cyberpunk 2077 UI Colors palette (https://www.color-hex.com/color-palette/1041326)
        bg: {
          canvas: { value: "#050403" },
          panel: { value: "#0d0b08" },
          panelAlt: { value: "#171309" },
        },
        neon: {
          yellow: { value: "#f3e600" },
          cyan: { value: "#55ead4" },
          crimson: { value: "#c5003c" },
          darkred: { value: "#880425" },
        },
      },
      fonts: {
        heading: { value: "var(--font-orbitron), sans-serif" },
        body: { value: "var(--font-rajdhani), sans-serif" },
      },
      shadows: {
        glowYellow: { value: "0 0 12px rgba(243,230,0,0.55), 0 0 2px rgba(243,230,0,0.8)" },
        glowCyan: { value: "0 0 12px rgba(85,234,212,0.5), 0 0 2px rgba(85,234,212,0.8)" },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
