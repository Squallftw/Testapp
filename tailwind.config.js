/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['"Noto Naskh Arabic"', 'Inter', 'system-ui', 'sans-serif'],
        // Mono for tabular numerics (money columns, timestamps, IDs).
        // Loaded via the same Google Fonts link as Manrope; ui-monospace
        // is the macOS fallback that already groups with tabular figures.
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Mapped to CSS vars in src/index.css so themes can be swapped at runtime.
        'bati-bg': 'var(--bati-bg)',
        'bati-card': 'var(--bati-card)',
        'bati-border': 'var(--bati-border)',
        'bati-border-soft': 'var(--bati-border-soft)',
        'bati-text': 'var(--bati-text)',
        'bati-muted': 'var(--bati-muted)',
        // Primary (royal blue). bati-teal* alias to these in index.css.
        'bati-primary': 'var(--bati-primary)',
        'bati-primary-deep': 'var(--bati-primary-deep)',
        'bati-primary-soft': 'var(--bati-primary-soft)',
        'bati-teal': 'var(--bati-teal)',
        'bati-teal-deep': 'var(--bati-teal-deep)',
        'bati-teal-soft': 'var(--bati-teal-soft)',
        // Teal heritage secondary
        'bati-accent': 'var(--bati-accent)',
        'bati-accent-soft': 'var(--bati-accent-soft)',
        'bati-terra': 'var(--bati-terra)',
        'bati-terra-soft': 'var(--bati-terra-soft)',
        'bati-ochre': 'var(--bati-ochre)',
        'bati-success': 'var(--bati-success)',
        'bati-success-soft': 'var(--bati-success-soft)',
        'bati-warning': 'var(--bati-warning)',
        'bati-warning-soft': 'var(--bati-warning-soft)',
      },
    },
  },
  plugins: [],
};
