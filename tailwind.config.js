/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F1EFE8',
          100: '#E6E2D6',
          500: '#1D6EEA',
          600: '#0C447C',
          900: '#0C1A2E',
        },
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
      },
    },
  },
  plugins: [],
}
