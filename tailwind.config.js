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
          50: '#f4fbf7',
          100: '#e4f7eb',
          200: '#ceeedb',
          300: '#a7e0c0',
          400: '#7acb9d',
          500: '#52b07b',
          600: '#3e9162',
          700: '#337450',
          800: '#2a5d41',
          900: '#234c37',
          950: '#102a1d',
        },
        dark: {
          50: '#f6f6f7',
          100: '#e1e2e5',
          200: '#c5c7ce',
          300: '#9fa3ae',
          400: '#757b8a',
          500: '#595f6e',
          600: '#464a57',
          700: '#3a3d47',
          800: '#2e3037',
          900: '#1d1e22',
          950: '#0d0d10',
        }
      }
    },
  },
  plugins: [],
}
