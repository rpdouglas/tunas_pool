import type { ReactNode } from 'react';
import { MDXProvider } from '@mdx-js/react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { GameDayPage } from '../../components/layout/GameDayPage';
import { useBingoMember } from '../../components/layout/useBingoMember';
import { Panel } from '../../components/ui/Panel';
import NotFound from '../../pages/NotFound';
import { useAuth } from '../auth/useAuth';
import { useMyProfile } from '../entry/entryData';
import {
  AUDIENCE_TITLES,
  GUIDE,
  audiencesFor,
  guideBase,
  type GuideAudience,
  type GuideShell,
} from './guide';
import { mdxComponents } from './mdxComponents';

/** Who sees the bingo pages in the player guide: its members and staff, nobody else (D-128). */
function useSeesBingo(): boolean {
  const { user, isAdmin, isCounter } = useAuth();
  const profile = useMyProfile(user?.uid).data ?? null;
  const signedIn = Boolean(user && !user.isAnonymous);
  const member = useBingoMember(user?.uid, signedIn && Boolean(profile));
  return member || isAdmin || isCounter;
}

/** The player guide sits on the Game Day surface; staff guides in their own shell's page. */
function Frame({
  shell,
  title,
  children,
}: {
  shell: GuideShell;
  title: string;
  children: ReactNode;
}) {
  if (shell === 'player') return <GameDayPage title={title}>{children}</GameDayPage>;
  return (
    <div className="flex max-w-player flex-col gap-4">
      <h1 className="font-heading text-h2">{title}</h1>
      {children}
    </div>
  );
}

function HelpIndex({ shell, audiences }: { shell: GuideShell; audiences: GuideAudience[] }) {
  const base = guideBase(shell);
  return (
    <Frame shell={shell} title="How it works">
      {audiences.map((audience) => {
        const pages = GUIDE.filter((page) => page.audience === audience);
        if (!pages.length) return null;
        return (
          <Panel key={audience} title={AUDIENCE_TITLES[audience]}>
            <ul className="flex flex-col gap-2">
              {pages.map((page) => (
                <li key={page.slug}>
                  <Link
                    to={`${base}/${page.slug}`}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-md border-2 border-line-subtle bg-surface px-4 py-2"
                  >
                    <span className="flex flex-col">
                      <span className="font-heading text-h3">{page.title}</span>
                      <span className="text-body-sm text-ink-muted">{page.summary}</span>
                    </span>
                    <span aria-hidden="true" className="text-h3 text-ink-muted">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </Frame>
  );
}

function HelpPage({ shell, audiences }: { shell: GuideShell; audiences: GuideAudience[] }) {
  const { slug } = useParams();
  const page = GUIDE.find((p) => p.slug === slug && audiences.includes(p.audience));
  // A bingo page to someone outside bingo is an ordinary missing page, like /b is (D-128).
  if (!page)
    return shell === 'player' ? <NotFound /> : <p className="text-body">Page not found.</p>;
  const base = guideBase(shell);
  const siblings = GUIDE.filter((p) => p.audience === page.audience);
  const next = siblings[siblings.indexOf(page) + 1];
  return (
    <Frame shell={shell} title={page.title}>
      <Panel>
        <MDXProvider components={mdxComponents}>
          <page.Content />
        </MDXProvider>
      </Panel>
      <nav aria-label="Guide" className="flex flex-col gap-2">
        {next ? (
          <Link to={`${base}/${next.slug}`} className="btn btn-primary">
            Next: {next.title}
          </Link>
        ) : null}
        <Link to={base} className="btn btn-secondary">
          All help pages
        </Link>
      </nav>
    </Frame>
  );
}

/** `/help`, `/admin/help`, `/counter/help`: the guide's own chunk (D-136). */
export default function HelpRoutes({ shell }: { shell: GuideShell }) {
  const seesBingo = useSeesBingo();
  const audiences = audiencesFor(shell, seesBingo);
  return (
    <Routes>
      <Route index element={<HelpIndex shell={shell} audiences={audiences} />} />
      <Route path=":slug" element={<HelpPage shell={shell} audiences={audiences} />} />
    </Routes>
  );
}
