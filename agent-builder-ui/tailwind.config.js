/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        "ipad-pro": { max: "1024px" },
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.3s ease-out forwards",
      },
    },
  },
  safelist: [
    "md:w-[calc(100vw-295px)]",
    "md:w-[calc(100vw-300px)]",
    "md:w-[calc(100vw-320px)]",
    "md:w-[calc(100vw-367px)]",
    "w-[calc(100vw-295px)]",
    "w-[calc(100vw-300px)]",
    "w-[calc(100vw-320px)]",
    "w-[calc(100vw-367px)]",
  ],
  plugins: [],
};
