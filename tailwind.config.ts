import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Ignite red family. DEFAULT/dark/light resolve through CSS variables
        // (see globals.css) so they adapt to the light/dark theme; the numbered
        // scale stays fixed for the rare places that need a specific tint.
        ignite: {
          DEFAULT: 'rgb(var(--c-ignite) / <alpha-value>)',
          dark: 'rgb(var(--c-ignite-dark) / <alpha-value>)',
          light: 'rgb(var(--c-ignite-light) / <alpha-value>)',
          50: '#fff1f1',
          100: '#ffdada',
          200: '#ffb3b3',
          300: '#ff8080',
          400: '#ff4d4d',
          500: '#ed1515',
          600: '#b30f0f',
          700: '#8a0c0c',
          800: '#5c0808',
          900: '#330404',
        },
        // Base + surface shades (theme-aware via CSS variables).
        base: 'rgb(var(--c-base) / <alpha-value>)',
        surface: {
          1: 'rgb(var(--c-surface-1) / <alpha-value>)',
          2: 'rgb(var(--c-surface-2) / <alpha-value>)',
          3: 'rgb(var(--c-surface-3) / <alpha-value>)',
        },
        // Neutral text (theme-aware via CSS variables).
        content: {
          DEFAULT: 'rgb(var(--c-content) / <alpha-value>)',
          muted: 'rgb(var(--c-content-muted) / <alpha-value>)',
        },
      },
      boxShadow: {
        // Red hover glow used across buttons/cards
        glow: '0 0 0 1px rgba(237,21,21,0.35), 0 0 18px -2px rgba(237,21,21,0.45)',
        'glow-sm': '0 0 12px -3px rgba(237,21,21,0.5)',
      },
      keyframes: {
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        'typing-bounce': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        'toast-in': {
          from: { transform: 'translateX(120%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 1s linear infinite',
        'typing-bounce': 'typing-bounce 1.2s ease-in-out infinite',
        'toast-in': 'toast-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
