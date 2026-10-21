import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { MDXProvider } from '@mdx-js/react';
import { MemoryRouter } from 'react-router-dom';
import { GUIDE, audiencesFor } from './guide';
import { mdxComponents } from './mdxComponents';

// The guide check (D-136, `npm run guide:check`): the pages, their screenshots, the smoke run that
// takes them, and the app's routes must agree. A failure here says which page to fix.
const ROOT = path.resolve(__dirname, '../../..');
const SHOTS = path.join(ROOT, 'public/guide/shots');
const PAGES = path.join(__dirname, 'pages');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

const sources = Object.fromEntries(
  readdirSync(PAGES, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => [path.basename(f, '.mdx'), readFileSync(path.join(PAGES, f), 'utf8')]),
);
const smoke = read('scripts/e2e-smoke.ts');
const smokeNames = new Set(
  [...smoke.matchAll(/(?:visit|checkScreen|guideShot)\(\s*[\w.]+,\s*'([\w-]+)'/g)].map((m) => m[1]),
);
const routes = [...read('src/App.tsx').matchAll(/path="(\/[^"]*)"/g)].map(
  (m) => new RegExp(`^${m[1].replace(/:\w+/g, '[^/]+').replace(/\/\*$/, '(/.*)?')}$`),
);

describe('the guide', () => {
  it('has pages, each with its frontmatter, and no slug used twice', () => {
    expect(GUIDE.length).toBeGreaterThan(0);
    for (const page of GUIDE) {
      expect(page.title, page.slug).toBeTruthy();
      expect(page.summary, page.slug).toBeTruthy();
      expect(['player', 'bingo', 'admin', 'counter', 'bingo-staff']).toContain(page.audience);
      expect(String(page.reviewed), `${page.slug}: reviewed`).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
    expect(new Set(GUIDE.map((p) => p.slug)).size).toBe(GUIDE.length);
  });

  it('lists every <Shot> in screens, and every screen is a smoke run name', () => {
    for (const page of GUIDE) {
      const shots = [...sources[page.slug].matchAll(/<Shot\s+name="([\w-]+)"/g)].map((m) => m[1]);
      for (const name of shots) expect(page.screens ?? [], `${page.slug}: ${name}`).toContain(name);
      for (const name of page.screens ?? [])
        expect(
          smokeNames.has(name),
          `${page.slug}: "${name}" isn't a visit() in e2e-smoke.ts`,
        ).toBe(true);
    }
  });

  it('has a screenshot for every screen, and none left over (npm run guide:shots)', () => {
    const wanted = new Set(GUIDE.flatMap((p) => p.screens ?? []));
    const files = existsSync(SHOTS) ? readdirSync(SHOTS).filter((f) => f.endsWith('.webp')) : [];
    const missing = [...wanted].filter((name) => !files.includes(`${name}.webp`));
    const orphans = files.filter((f) => !wanted.has(f.replace(/\.webp$/, '')));
    expect(missing, 'missing screenshots: run npm run guide:shots').toEqual([]);
    expect(orphans, 'screenshots no page uses: delete them').toEqual([]);
  });

  it('links only to screens that exist, and covers paths that exist', () => {
    const slugs = new Set(GUIDE.map((p) => p.slug));
    for (const page of GUIDE) {
      for (const [, href] of sources[page.slug].matchAll(/\]\((\/[^)\s]*)\)/g)) {
        const help = /^\/(?:admin\/|counter\/)?help\/([\w-]+)$/.exec(href);
        if (help) expect(slugs.has(help[1]), `${page.slug}: ${href}`).toBe(true);
        else
          expect(
            routes.some((r) => r.test(href)),
            `${page.slug}: ${href}`,
          ).toBe(true);
      }
      for (const cover of page.covers ?? [])
        expect(existsSync(path.join(ROOT, cover)), `${page.slug}: covers ${cover}`).toBe(true);
    }
  });

  it('shows bingo pages to bingo members and staff only (D-128)', () => {
    expect(audiencesFor('player', false)).toEqual(['player']);
    expect(audiencesFor('player', true)).toContain('bingo');
    expect(audiencesFor('counter', false)).not.toContain('admin');
  });

  it.each(GUIDE.map((p) => [p.slug, p] as const))('renders %s', (_slug, page) => {
    render(
      <MemoryRouter>
        <MDXProvider components={mdxComponents}>
          <page.Content />
        </MDXProvider>
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    for (const img of screen.queryAllByRole('img')) expect(img).toHaveAttribute('alt');
  });
});
