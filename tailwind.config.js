/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nwbus: {
          primary: '#1C2B36',
          secondary: '#5A6A74',
          accent: '#DE9526',
          danger: '#B23B27',
          dark: '#101B24',
        },
      },
      fontFamily: {
        arabic: ['IBM Plex Sans Arabic', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
