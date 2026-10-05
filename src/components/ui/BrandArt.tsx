import wordmarkUrl from '../../assets/brand/wordmark.webp';
import tunaBadgeUrl from '../../assets/brand/tuna-badge.webp';
import helmetUrl from '../../assets/brand/pawn-shop-helmet.webp';

/**
 * The supplied artwork (docs/BRAND_ASSETS.md). All three are transparent WebPs with fixed
 * width/height so the page doesn't jump while they load. Pass a Tailwind width via className.
 */

/** TUNAS / PICK EM lockup with the football. The page's <h1> carries the name, so the image is decorative. */
export function WordmarkArt({ className = 'w-72' }: { className?: string }) {
  return (
    <img
      src={wordmarkUrl}
      alt=""
      width={720}
      height={472}
      decoding="async"
      className={`h-auto max-w-full ${className}`}
    />
  );
}

/** Tuna the mascot in the round crest. Decorative by default; give `alt` when it stands alone. */
export function TunaBadge({ className = 'w-40', alt = '' }: { className?: string; alt?: string }) {
  return (
    <img
      src={tunaBadgeUrl}
      alt={alt}
      width={640}
      height={641}
      decoding="async"
      className={`h-auto max-w-full ${className}`}
    />
  );
}

/** The 2NA helmet with The Pawn Shop crest, for the footer of the player home screen. */
export function PawnShopHelmet({ className = 'w-44' }: { className?: string }) {
  return (
    <img
      src={helmetUrl}
      alt="2NA helmet with The Pawn Shop crest"
      width={640}
      height={510}
      loading="lazy"
      decoding="async"
      className={`h-auto max-w-full ${className}`}
    />
  );
}
