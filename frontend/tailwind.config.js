/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Segoe UI', 'Arial', 'sans-serif'] },
      colors: {
        brand: { DEFAULT: '#174d49', dark: '#103b38' },
        mint: '#c9f3b5',
        ink: '#172e35',
        muted: '#52656c',
        surface: '#f5f7f6',
        line: '#dde5e2',
      },
    },
  },
  plugins: [],
};
