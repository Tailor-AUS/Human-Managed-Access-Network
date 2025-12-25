/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366f1',
          light: '#818cf8',
          dark: '#4f46e5',
        },
        background: {
          DEFAULT: '#0f0f1a',
          secondary: '#1a1a2e',
          tertiary: '#252542',
        },
        surface: '#2a2a4a',
        border: '#3f3f5a',
        level: {
          open: '#22c55e',
          standard: '#3b82f6',
          gated: '#f59e0b',
          locked: '#ef4444',
        },
      },
    },
  },
  plugins: [],
}
