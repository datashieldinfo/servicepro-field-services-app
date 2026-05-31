/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans Arabic', 'sans-serif'],
        arabic: ['Noto Sans Arabic', 'sans-serif'],
      },
      colors: {
        navy: {
          DEFAULT: '#1E3A8A',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E3A8A',
          900: '#1E3064',
        },
        gold: {
          DEFAULT: '#F59E0B',
          50: '#FFFBEB',
          100: '#FEF3C7',
        },
      },
    },
  },
  plugins: [],
};
