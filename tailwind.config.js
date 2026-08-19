/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hand: {
          left: '#00E5FF',     // Electric Cyan / Blue
          leftDark: '#0097A7',
          right: '#FF6D00',    // Radiant Amber / Orange
          rightDark: '#E65100',
        },
        darkBg: '#0b0f19',
        panelBg: '#131b2e',
        cardBg: '#1a243d',
        accentGold: '#FFD700',
      },
      animation: {
        'pulse-fast': 'pulse 0.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'hit-splash': 'hitSplash 0.3s ease-out forwards',
        'flash-border': 'flashBorder 0.2s ease-out',
      },
      keyframes: {
        hitSplash: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        flashBorder: {
          '0%': { borderColor: '#ffffff', boxShadow: '0 0 25px #ffffff' },
          '100%': { borderColor: 'transparent', boxShadow: 'none' },
        }
      }
    },
  },
  plugins: [],
}
