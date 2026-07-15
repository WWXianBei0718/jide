/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf8f6',
          100: '#f2e8e5',
          200: '#eaddd7',
          300: '#e0cec7',
          400: '#d2bab0',
          500: '#bfa094',
          600: '#a18072',
          700: '#977669',
          800: '#846358',
          900: '#43302b',
        },
        warm: {
          50: '#fdfcfb',
          100: '#f9f6f3',
          200: '#f2ebe5',
          300: '#e8ddd3',
          400: '#d9c9bb',
          500: '#c4a892',
          600: '#a68468',
          700: '#8b6651',
          800: '#715244',
          900: '#5c4438',
        }
      },
    },
  },
  plugins: [],
}
