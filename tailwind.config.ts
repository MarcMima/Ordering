import type { Config } from "tailwindcss";

/**
 * MIMA brand palette — keep in sync with CSS variables in src/app/globals.css (:root).
 */
const brand = {
  green: "#5A713F",
  sage: "#94BEB2",
  sand: "#E7CDAF",
  terracotta: "#C56D4A",
  orange: "#CE7925",
  tan: "#CDAF7A",
} as const;

export default {
  theme: {
    extend: {
      colors: {
        brand,
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F5F1E8",
        },
        background: "#F5F1E8",
        ink: {
          DEFAULT: "#1A1A1A",
          soft: "#3D3D3D",
        },
        accent: {
          terracotta: brand.terracotta,
          orange: brand.orange,
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Georgia", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.75rem",
        lg: "1rem",
        xl: "1.25rem",
      },
    },
  },
} satisfies Config;
