import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...fontFamily.sans]
      },
      colors: {
        kalp: {
          DEFAULT: '#4f46e5',
          foreground: '#ffffff'
        }
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
};

export default config;
