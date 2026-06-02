/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        // Gentle idle bob.
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        // Single-click reaction.
        bounce1: {
          '0%': { transform: 'translateY(0) scale(1)' },
          '30%': { transform: 'translateY(-18px) scale(1.1)' },
          '60%': { transform: 'translateY(0) scale(0.95)' },
          '100%': { transform: 'translateY(0) scale(1)' },
        },
        // Double-click reaction.
        spin1: {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '100%': { transform: 'rotate(360deg) scale(1)' },
        },
        // Floating "♥" / "~" text that rises and fades.
        floatText: {
          '0%': { transform: 'translateY(0) scale(0.6)', opacity: '0' },
          '20%': { transform: 'translateY(-10px) scale(1)', opacity: '1' },
          '100%': { transform: 'translateY(-48px) scale(1)', opacity: '0' },
        },
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        bounce1: 'bounce1 0.5s ease-out',
        spin1: 'spin1 0.6s ease-in-out',
        floatText: 'floatText 1.1s ease-out forwards',
      },
    },
  },
  plugins: [],
}
