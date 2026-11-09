/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tide: { 50: '#ECFAF7', 100: '#D0F2EA', 200: '#A3E4D6', 300: '#6ACFBC', 400: '#35B29F', 500: '#159585', 600: '#0C776C', 700: '#0D5F58', 800: '#0E4C47', 900: '#0B3B38' },
        coral: { DEFAULT: '#F2704D', dark: '#D4532F', soft: '#FDECE6' },
        slate2: { DEFAULT: '#14272B', 2: '#3F5358', 3: '#7A8D92', 4: '#AEBDC1' },
        mist: '#F3F7F6',
        edge: '#DFE8E6',
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
