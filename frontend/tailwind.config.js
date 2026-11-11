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
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          light: 'rgb(var(--color-primary-light) / <alpha-value>)'
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          light: 'rgb(var(--color-secondary-light) / <alpha-value>)'
        },
        neutral: {
          light: 'rgb(var(--color-canvas) / <alpha-value>)',
          gray: 'rgb(var(--color-line) / <alpha-value>)',
          darkgray: 'rgb(var(--color-muted) / <alpha-value>)',
          dark: 'rgb(var(--color-ink) / <alpha-value>)'
        },
        accent: {
          gold: 'rgb(var(--color-secondary) / <alpha-value>)',
          sand: 'rgb(var(--color-secondary-light) / <alpha-value>)',
          black: 'rgb(var(--color-ink) / <alpha-value>)'
        },
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Mukta', 'system-ui', 'sans-serif'],
        display: ['Mukta', 'system-ui', 'sans-serif'],
        cormorant: ['Mukta', 'system-ui', 'sans-serif'],
        raleway: ['Mukta', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 8px 24px rgb(16 24 40 / 0.06)'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'fade-in-down': 'fade-in-down 180ms ease-out'
      }
    },
  },
  plugins: [],
}
