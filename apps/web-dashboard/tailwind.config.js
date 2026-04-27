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
      // iOS notch / home-indicator safe-area utilities. Use as `pt-safe`,
      // `pb-safe`, `pl-safe`, `pr-safe`, or stack with regular padding e.g.
      // `pb-[calc(env(safe-area-inset-bottom)+1rem)]`.
      spacing: {
        safe: 'env(safe-area-inset-bottom)',
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.pt-safe': { paddingTop: 'env(safe-area-inset-top)' },
        '.pb-safe': { paddingBottom: 'env(safe-area-inset-bottom)' },
        '.pl-safe': { paddingLeft: 'env(safe-area-inset-left)' },
        '.pr-safe': { paddingRight: 'env(safe-area-inset-right)' },
        '.px-safe': {
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        },
        '.py-safe': {
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
        '.mb-safe': { marginBottom: 'env(safe-area-inset-bottom)' },
        '.mt-safe': { marginTop: 'env(safe-area-inset-top)' },
        '.bottom-safe': { bottom: 'env(safe-area-inset-bottom)' },
      })
    },
  ],
}
