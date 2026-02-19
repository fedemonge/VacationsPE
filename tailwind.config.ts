import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        woden: {
          primary: "#EA7704",
          "primary-hover": "#D06A03",
          "primary-light": "rgba(234, 119, 4, 0.15)",
          "primary-lighter": "rgba(234, 119, 4, 0.05)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
