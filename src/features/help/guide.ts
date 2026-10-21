import type { MDXContent } from 'mdx/types';

/**
 * The in-app guide (D-136): one .mdx file per page under ./pages/<audience>/, its frontmatter the
 * table of contents. The whole guide is one lazy chunk, so the pages are read eagerly inside it.
 */
export type GuideAudience = 'player' | 'bingo' | 'admin' | 'counter' | 'bingo-staff';

export interface GuideMeta {
  title: string;
  /** One line for the list of pages. */
  summary: string;
  audience: GuideAudience;
  order: number;
  /** Screenshot names: the smoke run's visit() names, saved to public/guide/shots/<name>.webp. */
  screens?: string[];
  /** Source paths (prefixes) this page describes: a change there nudges an update (docs-sync). */
  covers?: string[];
  /** When the words were last checked against the screens, YYYY-MM-DD. */
  reviewed: string;
}

export interface GuidePage extends GuideMeta {
  slug: string;
  Content: MDXContent;
}

/** Which audiences each shell shows. Bingo pages only reach members and staff (D-128, D-135). */
export type GuideShell = 'player' | 'admin' | 'counter';

const modules = import.meta.glob<{ default: MDXContent; frontmatter: GuideMeta }>(
  './pages/**/*.mdx',
  { eager: true },
);

export const GUIDE: GuidePage[] = Object.entries(modules)
  .map(([path, mod]) => ({
    ...mod.frontmatter,
    slug: path
      .split('/')
      .pop()!
      .replace(/\.mdx$/, ''),
    Content: mod.default,
  }))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export const AUDIENCE_TITLES: Record<GuideAudience, string> = {
  player: 'Playing the pool',
  bingo: 'Tunas 649 Bingo',
  admin: 'Running the pool',
  counter: 'At the counter',
  'bingo-staff': 'Running Tunas 649 Bingo',
};

export function audiencesFor(shell: GuideShell, seesBingo: boolean): GuideAudience[] {
  if (shell === 'admin') return ['admin', 'counter', 'bingo-staff'];
  if (shell === 'counter') return ['counter', 'bingo-staff'];
  return seesBingo ? ['player', 'bingo'] : ['player'];
}

export function guideBase(shell: GuideShell): string {
  return shell === 'player' ? '/help' : `/${shell}/help`;
}
