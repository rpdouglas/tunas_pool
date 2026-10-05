import { useState } from 'react';
import { TEXT_SIZES, applyTextSize, loadTextSize, type TextSize } from '../../lib/textSize';

/**
 * Text size: Normal, Large, Extra large (DESIGN_SYSTEM §9). Three plain buttons, remembered on the
 * device. Many players are older, so this sits where they can find it, not in a settings page.
 */
export function TextSizeControl({ onDark = false }: { onDark?: boolean }) {
  const [size, setSize] = useState<TextSize>(loadTextSize);
  const tone = onDark
    ? 'border-white text-ink-inverse aria-pressed:bg-white aria-pressed:text-purple-700'
    : 'border-line-strong text-ink aria-pressed:bg-purple-700 aria-pressed:text-ink-inverse';
  return (
    <div role="group" aria-label="Text size" className="flex flex-col items-center gap-2">
      <p className={`text-body font-semibold ${onDark ? 'text-ink-inverse' : 'text-ink'}`}>
        Text size
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {TEXT_SIZES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={size === option.value}
            onClick={() => {
              applyTextSize(option.value);
              setSize(option.value);
            }}
            className={`min-h-touch rounded-pill border-2 px-4 font-heading text-h3 ${tone}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
