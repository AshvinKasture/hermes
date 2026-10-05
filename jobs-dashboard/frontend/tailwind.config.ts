/** @type {import("tailwindcss").Config} */
export default {
  content: ["./src/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        hermes: {
          bg: "#0f0f14",
          surface: "#1a1a24",
          border: "#2a2a3a",
          text: "#e0e0f0",
          muted: "#8888a0",
          accent: "#7c4dff",
          green: "#22c979",
          red: "#e55555",
        },
      },
    },
  },
};