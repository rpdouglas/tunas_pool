/**
 * tailwind.preset.cjs — Tunas Pick 'Em (Baltimore Ravens palette)
 * Usage (tailwind.config.cjs):
 *   module.exports = {
 *     presets: [require('./tailwind.preset.cjs')],
 *     content: ['./index.html', './src/**\/*.{ts,tsx}'],
 *   };
 *
 * Colors read from CSS variables in src/styles/tokens.css (RGB channels),
 * so opacity modifiers work: bg-purple-700/50, border-gold-400/30, etc.
 * `theme.colors` is REPLACED (not extended) on purpose: only brand colors exist.
 */
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;
const ramp = (name, steps) =>
  Object.fromEntries(steps.map((s) => [s, withAlpha(`--${name}-${s}`)]));

module.exports = {
  theme: {
    screens: {
      xs: '420px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },

    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: withAlpha('--white'),
      black: withAlpha('--black'),
      purple: ramp('purple', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
      gold: ramp('gold', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
      red: ramp('red', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
      neutral: ramp('neutral', [50, 100, 200, 300, 400, 500, 600, 700, 900]),
      success: {
        50: withAlpha('--success-50'),
        300: withAlpha('--success-300'),
        600: withAlpha('--success-600'),
        800: withAlpha('--success-800'),
      },
      // Semantic aliases: prefer these in components
      page: {
        gameday: withAlpha('--bg-gameday'),
        backoffice: withAlpha('--bg-backoffice'),
      },
      surface: {
        DEFAULT: withAlpha('--surface'),
        muted: withAlpha('--surface-muted'),
        tint: withAlpha('--surface-tint'),
      },
      ink: {
        DEFAULT: withAlpha('--text'),
        muted: withAlpha('--text-muted'),
        inverse: withAlpha('--text-on-dark'),
        emphasis: withAlpha('--text-emphasis'),
        accent: withAlpha('--text-accent'),
        'accent-dark': withAlpha('--text-accent-dark'),
        urgent: withAlpha('--urgent-text'),
      },
      line: {
        strong: withAlpha('--border-strong'),
        subtle: withAlpha('--border-subtle'),
        divider: withAlpha('--divider'),
      },
      action: {
        primary: withAlpha('--action-primary'),
        'primary-hover': withAlpha('--action-primary-hover'),
        'primary-text': withAlpha('--action-primary-text'),
        secondary: withAlpha('--action-secondary'),
        'secondary-hover': withAlpha('--action-secondary-hover'),
      },
      urgent: withAlpha('--urgent'),
    },

    fontFamily: {
      display: ['var(--font-display)'],
      heading: ['var(--font-heading)'],
      body: ['var(--font-body)'],
      sans: ['var(--font-body)'],
    },

    extend: {
      fontSize: {
        'wordmark': ['clamp(3rem, 14vw, 5.5rem)', { lineHeight: '0.9' }],
        'stat-xl': ['4rem', { lineHeight: '0.9', fontWeight: '800' }],
        'h1': ['2.5rem', { lineHeight: '1', fontWeight: '800' }],
        'h2': ['1.75rem', { lineHeight: '1.1', fontWeight: '700' }],
        'h3': ['1.375rem', { lineHeight: '1.2', fontWeight: '700' }],
        'bar': ['1.375rem', { lineHeight: '1', letterSpacing: '0.02em', fontWeight: '700' }],
        'colhead': ['0.875rem', { lineHeight: '1', letterSpacing: '0.05em', fontWeight: '700' }],
        'team': ['1.375rem', { lineHeight: '1.1', fontWeight: '700' }],
        'body': ['1rem', { lineHeight: '1.5' }],
        'body-sm': ['0.875rem', { lineHeight: '1.25rem' }],
      },

      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },

      borderWidth: { DEFAULT: '1px', 0: '0', 2: '2px', 3: '3px' },

      boxShadow: {
        sticker: 'var(--shadow-sticker)',
        'sticker-gold': 'var(--shadow-sticker-gold)',
        panel: 'var(--shadow-panel)',
        raised: 'var(--shadow-raised)',
      },

      minHeight: { touch: 'var(--touch-min)' },
      minWidth: { touch: 'var(--touch-min)' },

      maxWidth: { player: '30rem', backoffice: '72rem' },

      zIndex: { progress: '30', topbar: '40', modal: '50', toast: '60' },

      transitionDuration: {
        press: 'var(--dur-press)',
        state: 'var(--dur-state)',
        reveal: 'var(--dur-reveal)',
      },
      transitionTimingFunction: { out: 'var(--ease-out)' },

      keyframes: {
        // The one orchestrated moment: winner reveal
        'crown-drop': {
          '0%': { transform: 'translateY(-24px) rotate(-8deg)', opacity: '0' },
          '70%': { transform: 'translateY(2px) rotate(2deg)', opacity: '1' },
          '100%': { transform: 'translateY(0) rotate(0)', opacity: '1' },
        },
      },
      animation: {
        'crown-drop': 'crown-drop var(--dur-reveal) var(--ease-out) both',
      },
    },
  },
};
