/** Tailwind v3. All brand tokens live in tailwind.preset.cjs + src/styles/tokens.css. */
module.exports = {
  presets: [require('./tailwind.preset.cjs')],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};
