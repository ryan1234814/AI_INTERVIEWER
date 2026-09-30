/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        'background-secondary': 'var(--background-secondary)',
        foreground: 'var(--foreground)',
        'foreground-secondary': 'var(--foreground-secondary)',
        'foreground-tertiary': 'var(--foreground-tertiary)',
        card: 'var(--card-solid)',
        surface: '#111725',
        border: 'var(--card-border)',
        // Accent — indigo
        primary: {
          DEFAULT: '#4f46e5',
          dark: '#4338ca',
          light: '#6366f1',
          subtle: '#a5b4fc',
        },
        accent: {
          DEFAULT: '#4f46e5',
          dark: '#4338ca',
          light: '#6366f1',
        },
        // Semantic
        success: {
          DEFAULT: '#10b981',
          dark: '#059669',
          light: '#34d399',
        },
        warning: {
          DEFAULT: '#f59e0b',
          dark: '#d97706',
          light: '#fbbf24',
        },
        danger: {
          DEFAULT: '#ef4444',
          dark: '#dc2626',
          light: '#f87171',
        },
        // Kept so any residual utility usage stays on-palette (muted)
        cyan: { DEFAULT: '#0891b2', light: '#22d3ee' },
        purple: { DEFAULT: '#6366f1', light: '#818cf8' },
        pink: { DEFAULT: '#db2777', light: '#f472b6' },
        amber: { DEFAULT: '#f59e0b', light: '#fbbf24' },
        emerald: { DEFAULT: '#10b981', light: '#34d399' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        display: ['Inter', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.2s ease-out forwards',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.97)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      boxShadow: {
        'panel': '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.55)',
        'panel-hover': '0 1px 2px rgba(0,0,0,0.5), 0 12px 32px -12px rgba(0,0,0,0.65)',
        'elevation-sm': '0 1px 2px rgba(0,0,0,0.4)',
        'accent-ring': '0 0 0 3px rgba(79,70,229,0.14)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
    },
  },
  plugins: [],
}
