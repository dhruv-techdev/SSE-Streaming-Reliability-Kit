export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        dark: { 900: '#0a0a0a', 800: '#111111', 700: '#1a1a1a', 600: '#262626' },
        accent: { DEFAULT: '#3b82f6', light: '#60a5fa' },
      },
    },
  },
  plugins: [],
};
