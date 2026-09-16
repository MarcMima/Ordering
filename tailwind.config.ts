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
          DEFAULT: "#FBF8F3",
          muted: "#F3EEE6",
        },
        background: "#FBF8F3",
        ink: {
          DEFAULT: "#2C3320",
          soft: "#55584C",
          muted: "#6E6A61",
          quiet: "#8A8C7E",
        },
        hairline: { DEFAULT: "rgba(44,51,32,0.10)", strong: "rgba(44,51,32,0.14)" },
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
        DEFAULT: "0px",
        sm: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
      },
    },
  },
} satisfies Config;
