import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
  ClipboardList,
  History,
  House,
  Link2,
  LogOut,
  Menu,
  Printer,
  Share2,
  ShieldCheck,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import { sharePoolMessage } from '@shared/messages';
import { auth } from '../../lib/firebase';
import { currentSeason } from '../../lib/season';
import { initialsOf } from '../../lib/initials';
import { shareText } from '../../lib/share';
import { useAuth } from '../../features/auth/useAuth';
import { useCurrentWeek, useMyProfile } from '../../features/entry/entryData';
import { TextSizeControl } from '../ui/TextSizeControl';

function DrawerLink({
  to,
  icon,
  onNavigate,
  children,
}: {
  to: string;
  icon: ReactNode;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <Link to={to} onClick={onNavigate} className="app-drawer-row">
        <span aria-hidden="true" className="text-gold-300">
          {icon}
        </span>
        <span className="flex-1">{children}</span>
      </Link>
    </li>
  );
}

export interface MenuViewProps {
  /** Display name, or an email for a signed-in login without a roster profile. Empty for a guest. */
  name: string;
  email: string | null;
  signedIn: boolean;
  isAdmin: boolean;
  /** The counter role (D-095): gets a link to the Counter screens. */
  isCounter: boolean;
  /** The roster profile id, or null when there is none yet. */
  profileId: string | null;
  /** Hide "Link your history" for people the commissioner entered on paper (already linked). */
  showClaim: boolean;
  /** The print-sheet link while a week is open, otherwise null. */
  printTo: string | null;
  shareNote: string | null;
  onShare: () => void;
  onSignOut: () => void;
}

/**
 * The player menu (D-093): a slim bar with a labelled Menu button, and a drawer that holds the
 * links that used to be scattered at the bottom of the home screen, plus Text size. Many players
 * are older, so the button says "Menu" in words, rows are 48px, and Text size works on every screen.
 * This part takes plain props so /styleguide can show each state; AppBar below gathers the data.
 */
export function MenuView({
  name,
  email,
  signedIn,
  isAdmin,
  isCounter,
  profileId,
  showClaim,
  printTo,
  shareNote,
  onShare,
  onSignOut,
}: MenuViewProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [isOpen, setOpen] = useState(false);

  // The native <dialog> gives a focus trap, Escape to close, and focus back on the Menu button.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    if (!isOpen && el.open) el.close();
  }, [isOpen]);

  const close = () => setOpen(false);

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className="app-bar-button"
        >
          <Menu aria-hidden="true" size={24} />
          Menu
        </button>
        <Link
          to={profileId ? `/player/${profileId}` : '/account'}
          aria-label={profileId ? 'Your profile' : 'Sign in'}
          className="app-avatar"
        >
          {name ? initialsOf(name) : <UserRound aria-hidden="true" size={22} />}
        </Link>
      </header>

      <dialog
        ref={dialog}
        aria-label="Menu"
        className="app-drawer"
        onClose={() => setOpen(false)}
        // A tap on the dark area lands on the <dialog> itself, never on its contents.
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="app-drawer-body">
          <div className="flex items-center gap-3">
            <span className="app-avatar" aria-hidden="true">
              {name ? initialsOf(name) : <UserRound size={22} />}
            </span>
            <div className="min-w-0 flex-1">
              {name ? (
                <>
                  <p className="truncate font-heading text-h3">{name}</p>
                  {signedIn && email && email !== name && (
                    <p className="break-all text-body text-purple-200">{email}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-heading text-h3">Guest</p>
                  <Link to="/account" onClick={close} className="text-body text-gold-300 underline">
                    Sign in to save your picks
                  </Link>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="app-icon-button"
            >
              <X aria-hidden="true" size={26} />
            </button>
          </div>

          <nav aria-label="Main" className="mt-4">
            <ul className="flex flex-col gap-2">
              <DrawerLink to="/" icon={<House size={24} />} onNavigate={close}>
                This week
              </DrawerLink>
              {profileId && (
                <DrawerLink
                  to={`/player/${profileId}`}
                  icon={<UserRound size={24} />}
                  onNavigate={close}
                >
                  Your profile
                </DrawerLink>
              )}
              <DrawerLink to="/standings" icon={<Trophy size={24} />} onNavigate={close}>
                Season standings
              </DrawerLink>
              <DrawerLink to="/history" icon={<History size={24} />} onNavigate={close}>
                Your history
              </DrawerLink>
              {printTo && (
                <DrawerLink to={printTo} icon={<Printer size={24} />} onNavigate={close}>
                  Print a paper sheet
                </DrawerLink>
              )}
              {showClaim && (
                <DrawerLink to="/claim" icon={<Link2 size={24} />} onNavigate={close}>
                  Link your history
                </DrawerLink>
              )}
            </ul>
          </nav>

          <div className="app-drawer-divider">
            <TextSizeControl onDark />
          </div>

          <div className="app-drawer-divider flex flex-col gap-2">
            <button type="button" onClick={onShare} className="app-drawer-row">
              <span aria-hidden="true" className="text-gold-300">
                <Share2 size={24} />
              </span>
              <span className="flex-1 text-left">Share this pool</span>
            </button>
            {shareNote && (
              <p role="status" className="px-1 text-body text-purple-100">
                {shareNote}
              </p>
            )}
          </div>

          {(isAdmin || isCounter || signedIn) && (
            <ul className="app-drawer-divider flex flex-col gap-2">
              {isCounter && (
                <DrawerLink to="/counter" icon={<ClipboardList size={24} />} onNavigate={close}>
                  Counter
                </DrawerLink>
              )}
              {isAdmin && (
                <DrawerLink to="/admin" icon={<ShieldCheck size={24} />} onNavigate={close}>
                  <span className="flex items-center justify-between gap-2">
                    Admin dashboard
                    <span className="badge badge-pending">Admin</span>
                  </span>
                </DrawerLink>
              )}
              {signedIn && (
                <li>
                  {/* Hidden for guests: signing a guest out would lose their picks (D-093). */}
                  <button
                    type="button"
                    className="app-drawer-row"
                    onClick={() => {
                      close();
                      onSignOut();
                    }}
                  >
                    <span aria-hidden="true" className="text-gold-300">
                      <LogOut size={24} />
                    </span>
                    <span className="flex-1 text-left">Sign out</span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}

/** The menu for real screens: reads who is signed in, the roster profile, and the current week. */
export function AppBar() {
  const { user, isAdmin, isCounter } = useAuth();
  const profile = useMyProfile(user?.uid).data ?? null;
  const year = currentSeason();
  const week = useCurrentWeek(year).data ?? null;
  const navigate = useNavigate();
  const [shareNote, setShareNote] = useState<string | null>(null);

  const signedIn = Boolean(user && !user.isAnonymous);
  const open = Boolean(week && week.status === 'open' && Date.now() < week.lockAtMs);

  async function share() {
    const outcome = await shareText(sharePoolMessage(open && week ? week : null));
    setShareNote(
      outcome === 'copied'
        ? 'Invitation copied. Paste it into your group chat.'
        : outcome === 'failed'
          ? "Couldn't share from this browser."
          : null,
    );
  }

  return (
    <MenuView
      name={profile?.data.displayName ?? (signedIn ? (user?.email ?? '') : '')}
      email={signedIn ? (user?.email ?? null) : null}
      signedIn={signedIn}
      isAdmin={isAdmin}
      isCounter={isCounter}
      profileId={profile?.id ?? null}
      showClaim={profile?.data.origin !== 'admin'}
      printTo={week && open ? `/sheet/${year}/${week.id}` : null}
      shareNote={shareNote}
      onShare={share}
      onSignOut={() => void signOut(auth).then(() => navigate('/'))}
    />
  );
}
