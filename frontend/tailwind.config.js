/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      colors: {
        navy: {
          900: '#0A0E1A',
          800: '#111827',
        },
      },
    },
  },
  plugins: [],
}
