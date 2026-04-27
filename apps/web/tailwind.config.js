/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#020617',
        },
        felt: {
          DEFAULT: '#1a3a2a',
          dark: '#132b1f',
          light: '#22503a',
        },
        chip: {
          white: '#f5f5f5',
          red: '#ef4444',
          blue: '#3b82f6',
          green: '#22c55e',
          black: '#1f2937',
        },
      },
      animation: {
        'deal-in': 'dealIn 0.3s ease-out',
        'chip-fly': 'chipFly 0.5s ease-in-out',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        dealIn: {
          '0%': { transform: 'translateY(-100px) rotate(-10deg)', opacity: '0' },
          '100%': { transform: 'translateY(0) rotate(0)', opacity: '1' },
        },
        chipFly: {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '1' },
          '50%': { transform: 'translate(var(--chip-x, 0), var(--chip-y, -50px)) scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'translate(0, 0) scale(0)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
