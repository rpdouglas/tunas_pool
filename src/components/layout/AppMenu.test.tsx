import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MenuView, type MenuViewProps } from './AppMenu';

// jsdom has no modal <dialog>. This stands in for showModal() and close(), including the close event.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

const guest: MenuViewProps = {
  name: '',
  email: null,
  signedIn: false,
  isAdmin: false,
  profileId: null,
  showClaim: true,
  printTo: null,
  shareNote: null,
  onShare: () => undefined,
  onSignOut: () => undefined,
};

function show(props: Partial<MenuViewProps> = {}) {
  render(
    <MemoryRouter>
      <MenuView {...guest} {...props} />
    </MemoryRouter>,
  );
}

// A <dialog> that is not open is hidden from the accessibility tree, so `name` queries find only open ones.
const drawer = () => screen.queryByRole('dialog', { name: 'Menu' });

describe('MenuView', () => {
  it('shows a Menu button in words, and opens and closes the drawer', async () => {
    show();
    expect(drawer()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(drawer()).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(drawer()).toBeNull();
  });

  it('closes when a link is tapped', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('link', { name: 'Season standings' }));
    expect(drawer()).toBeNull();
  });

  it('treats a guest kindly: sign-in prompt, no profile, no sign out, no admin', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to save your picks' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.queryByRole('link', { name: 'Your profile' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Admin dashboard/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Link your history' })).toBeInTheDocument();
  });

  it('gives a signed-in player their profile, a sign out, and the text size buttons', async () => {
    const onSignOut = vi.fn();
    show({
      name: 'Dale D.',
      email: 'dale@tunas.test',
      signedIn: true,
      profileId: 'p1',
      printTo: '/sheet/2026/wk05',
      onSignOut,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    // Two links by that name: the avatar in the bar and the row in the drawer.
    const profileLinks = screen.getAllByRole('link', { name: 'Your profile' });
    expect(profileLinks).toHaveLength(2);
    profileLinks.forEach((link) => expect(link).toHaveAttribute('href', '/player/p1'));
    expect(screen.getByRole('link', { name: 'Print a paper sheet' })).toHaveAttribute(
      'href',
      '/sheet/2026/wk05',
    );
    expect(screen.getByRole('button', { name: 'Extra large' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Admin dashboard/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(drawer()).toBeNull();
  });

  it('shows the Admin dashboard only to the commissioner, and hides link-your-history when linked', async () => {
    show({ name: 'Ryan', signedIn: true, isAdmin: true, profileId: 'p2', showClaim: false });
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('link', { name: /Admin dashboard/ })).toHaveAttribute('href', '/admin');
    expect(screen.queryByRole('link', { name: 'Link your history' })).toBeNull();
  });

  it('hides the print link when no week is open', async () => {
    show({ printTo: null });
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByRole('link', { name: 'Print a paper sheet' })).toBeNull();
  });

  it('the avatar goes to the profile, or to sign-in for a guest', () => {
    show({ name: 'Dale D.', signedIn: true, profileId: 'p1' });
    expect(screen.getByRole('link', { name: 'Your profile' })).toHaveAttribute(
      'href',
      '/player/p1',
    );
  });
});
