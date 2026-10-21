import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';

/**
 * A screenshot from the smoke run (D-136): a 375px phone screen, framed, with what it shows in
 * words. `alt` says what matters on the screen, not "a screenshot", for anyone who can't see it.
 */
export function Shot({ name, alt, caption }: { name: string; alt: string; caption?: string }) {
  return (
    <figure className="my-4 flex flex-col items-center gap-2">
      <img
        src={`/guide/shots/${name}.webp`}
        alt={alt}
        width={375}
        height={812}
        loading="lazy"
        className="h-auto w-full max-w-[17.5rem] rounded-lg border-2 border-line-subtle shadow-panel"
      />
      {caption ? (
        <figcaption className="text-center text-body-sm text-ink-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

/** A helpful aside. The icon is decoration; the word "Tip" says what it is (never colour alone). */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <aside className="my-4 flex gap-3 rounded-md border-2 border-gold-400 bg-surface-tint p-3 text-body">
      <Lightbulb aria-hidden="true" size={24} className="shrink-0 text-ink-accent-dark" />
      <div className="flex flex-col gap-2">
        <p className="font-semibold">Tip</p>
        {children}
      </div>
    </aside>
  );
}

/** Numbered steps, big and spaced, one action each. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="my-3 flex list-decimal flex-col gap-3 pl-6 text-body">{children}</ol>;
}

/** Links inside the app stay in the app; anything else opens as a normal link. */
export function GuideLink({ href = '', children }: { href?: string; children?: ReactNode }) {
  const cls = 'text-ink-emphasis underline';
  return href.startsWith('/') ? (
    <Link to={href} className={cls}>
      {children}
    </Link>
  ) : (
    <a href={href} className={cls}>
      {children}
    </a>
  );
}
