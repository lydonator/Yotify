/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — deep, near-black with a cool tint
        ink: {
          900: '#07080d',
          800: '#0c0e16',
          700: '#12151f',
          600: '#191d2b',
          500: '#222738'
        },
        // Accent is overridden at runtime via CSS variables (--accent)
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent) / 0.15)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 0 40px -10px rgb(var(--accent) / 0.5)',
        card: '0 8px 40px -12px rgba(0,0,0,0.6)'
      },
      backdropBlur: {
        xs: '2px'
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '0.7' },
          '70%': { transform: 'scale(1.4)', opacity: '0' },
          '100%': { opacity: '0' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4,0,0.2,1) infinite',
        shimmer: 'shimmer 1.6s infinite'
      }
    }
  },
  plugins: []
}
