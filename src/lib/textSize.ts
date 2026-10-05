/**
 * The Text size setting (DESIGN_SYSTEM §9): Normal, Large, or Extra large, kept on the device. It
 * sets `data-text-size` on <html>, which tokens.css turns into 112.5% and 125%. A line in index.html
 * applies the saved choice before the first paint, so the page never flashes at the wrong size.
 */
export type TextSize = 'normal' | 'large' | 'xlarge';

export const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra large' },
];

const KEY = 'tunas.textSize';

export function loadTextSize(): TextSize {
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved === 'large' || saved === 'xlarge' ? saved : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyTextSize(size: TextSize): void {
  if (size === 'normal') delete document.documentElement.dataset.textSize;
  else document.documentElement.dataset.textSize = size;
  try {
    if (size === 'normal') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, size);
  } catch {
    // Private browsing: the choice lasts for this visit only.
  }
}
