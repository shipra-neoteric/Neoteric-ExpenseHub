/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Static fallback palette (non-dynamic contexts). Dynamic "brand"
        // surfaces use the theme-* utilities / getThemeColor(), backed by the
        // --theme-primary CSS variables, per UI_STYLE_GUIDE.md section 3.
        primary: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          DEFAULT: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        brand: {
          DEFAULT: 'var(--theme-primary)',
          light: 'var(--theme-primary-light)',
          dark: 'var(--theme-primary-dark)',
        },
      },
    },
  },
  plugins: [],
};
