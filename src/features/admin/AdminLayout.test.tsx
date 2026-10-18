import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';

vi.mock('../../lib/firebase', () => ({ auth: {} }));
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', isAnonymous: false, email: 'ryan@example.com' },
    isAdmin: true,
    isCounter: false,
  }),
}));
vi.mock('./claims/claimsData', () => ({ usePendingClaimCount: () => ({ data: 0 }) }));
vi.mock('../entry/entryData', () => ({
  useMyProfile: () => ({ data: null }),
  useCurrentWeek: () => ({ data: null }),
}));

it('every Back Office screen has the player Menu, the way back to the main page', () => {
  render(
    <MemoryRouter initialEntries={['/admin/roster']}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="roster" element={<p>Roster screen</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText('Roster screen')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Back Office' })).toBeInTheDocument();
});
