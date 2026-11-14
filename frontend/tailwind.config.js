/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'apple-ink': '#0b2240',
        'vetlife-navy': '#0b2240',
        'vetlife-teal': '#1d9496',
        'vetlife-teal-dark': '#147a7c',
        'vetlife-paw': '#11615c',
        'fog-canvas': '#fafbfc',
        'pure-white': '#ffffff',
        graphite: '#5b6675',
        'apple-slate': '#7b8694',
        charcoal: '#0f294a',
        smoke: '#38485c',
        iron: '#4c5b6e',
        ash: '#e8e8ed',
        'electric-blue': '#1d9496',
        'link-blue': '#147a7c',
      },
      fontFamily: {
        sans: ['"SF Pro Text"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"SF Pro Display"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '28px',
        pill: '980px',
        chip: '999px',
      },
    },
  },
  plugins: [],
};
