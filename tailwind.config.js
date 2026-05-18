/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        arabic: ['"Noto Naskh Arabic"', 'Manrope', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Mapped to CSS vars in src/index.css so themes can be swapped at runtime.
        'bati-bg': 'var(--bati-bg)',
        'bati-card': 'var(--bati-card)',
        'bati-border': 'var(--bati-border)',
        'bati-border-soft': 'var(--bati-border-soft)',
        'bati-text': 'var(--bati-text)',
        'bati-muted': 'var(--bati-muted)',
        'bati-teal': 'var(--bati-teal)',
        'bati-teal-deep': 'var(--bati-teal-deep)',
        'bati-teal-soft': 'var(--bati-teal-soft)',
        'bati-terra': 'var(--bati-terra)',
        'bati-terra-soft': 'var(--bati-terra-soft)',
        'bati-ochre': 'var(--bati-ochre)',
        'bati-success': 'var(--bati-success)',
        'bati-success-soft': 'var(--bati-success-soft)',
      },
    },
  },
  plugins: [],
};
