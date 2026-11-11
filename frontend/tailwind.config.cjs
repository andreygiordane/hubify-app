// Cores semânticas: os valores vêm das variáveis CSS em src/index.css (tema claro e escuro)
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: token('app'),
        surface: token('surface'),
        subtle: token('subtle'),
        hover: token('hover'),
        line: token('line'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        brand: { DEFAULT: token('brand'), hover: token('brand-hover'), soft: token('brand-soft'), ink: token('brand-ink') },
        'on-brand': token('on-brand'),
        signal: token('signal'),
        topbar: token('topbar'),
        rail: token('rail'),
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        success: token('success'),
        warning: token('warning'),
        // Conversa (estilo WhatsApp)
        chat: {
          bg: token('chat-bg'),
          header: token('chat-header'),
          in: token('bubble-in'),
          out: token('bubble-out'),
          ink: token('bubble-ink'),
          meta: token('bubble-meta'),
          accent: token('chat-accent'),
          tick: token('tick-read'),
        },
      },
      // Como texto, a marca usa um tom próprio (legível no papel claro)
      textColor: { brand: { DEFAULT: token('brand-text') } },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '"SF Pro Display"', '"Segoe UI"', '-apple-system', 'BlinkMacSystemFont', 'Roboto', '"Helvetica Neue"', 'sans-serif'],
        display: ['"Inter Variable"', 'Inter', '"SF Pro Display"', 'sans-serif'],
        mono: ['"Geist Mono Variable"', '"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
        bubble: '0 0 0 0 transparent',
        stage: 'var(--shadow-card)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'pop-in': { from: { opacity: 0, transform: 'scale(.96) translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-left': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'toast-in': { from: { opacity: 0, transform: 'translateY(-12px) scale(.97)' }, to: { opacity: 1, transform: 'none' } },
        'shrink-width': { from: { width: '100%' }, to: { width: '0%' } },
      },
      animation: {
        'fade-in': 'fade-in .15s ease-out',
        'pop-in': 'pop-in .14s ease-out',
        'slide-up': 'slide-up .18s ease-out',
        'slide-left': 'slide-left .2s ease-out',
        'toast-in': 'toast-in .22s cubic-bezier(.2,.8,.2,1)',
        'shrink-width': 'shrink-width linear forwards',
      },
    },
  },
  plugins: [],
}
