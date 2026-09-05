/** @type {import('tailwindcss').Config} */
// Ported verbatim from the inline `tailwind.config` that the CDN build ran in
// index.html. Keep the palette and font stacks in step with BRANDING_SPEC.md.
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './AdminApp.tsx',
    './constants.ts',
    './types.ts',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        esg: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        brand: {
          teal: '#004d4d',
          'teal-dark': '#003838',
          'teal-light': '#006666',
          lime: '#ccff00',
          'lime-dark': '#aadd00',
        },
      },
      fontFamily: {
        heading: ['Outfit', 'sans-serif'],
        sans: ['Inter', 'Noto Sans Thai', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
