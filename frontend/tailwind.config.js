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
          DEFAULT: '#17324E',
          light: '#1F507A'
        },
        secondary: {
          DEFAULT: '#C7A09E',
          light: '#E8D4D1'
        },
        neutral: {
          light: '#F7F1ED',
          gray: '#E2DBD6',
          darkgray: '#8C8784',
          dark: '#2B3A47'
        },
        accent: {
          gold: '#BD9E58',
          sand: '#D8C49A',
          black: '#2B2B2B'
        }
      },
      fontFamily: {
        cormorant: ['"Cormorant Garamond"', 'serif'],
        raleway: ['Raleway', 'sans-serif'],
      }
    },
  },
  plugins: [],
}