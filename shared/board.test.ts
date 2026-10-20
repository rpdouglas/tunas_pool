import { describe, expect, it } from 'vitest';
import {
  boardAccess,
  boardIsOpen,
  canChangeMessage,
  checkMessage,
  secondsToWait,
  unreadCount,
  type BoardViewer,
} from './board';

const paidPlayer: BoardViewer = {
  staff: false,
  entered: true,
  savedAccount: true,
  paid: true,
  muted: false,
  open: true,
  picksOpen: false,
};

describe('boardAccess', () => {
  it('lets a paid player with an account read and post', () => {
    expect(boardAccess(paidPlayer)).toEqual({
      canRead: true,
      canPost: true,
      note: null,
      action: null,
    });
  });

  it('keeps out someone who did not enter, and nudges them to make picks while they can', () => {
    expect(boardAccess({ ...paidPlayer, entered: false, picksOpen: true })).toMatchObject({
      canRead: false,
      action: 'make-picks',
    });
    expect(boardAccess({ ...paidPlayer, entered: false })).toMatchObject({
      canRead: false,
      action: null,
    });
  });

  it('lets a guest and an unpaid entry read but not post, and says why', () => {
    expect(boardAccess({ ...paidPlayer, savedAccount: false })).toMatchObject({
      canRead: true,
      canPost: false,
      action: 'save-account',
    });
    expect(boardAccess({ ...paidPlayer, paid: false }).note).toMatch(/confirms your payment/);
    expect(boardAccess({ ...paidPlayer, muted: true }).note).toMatch(/paused your posts/);
    expect(boardAccess({ ...paidPlayer, open: false }).note).toMatch(/closed/);
  });

  it('lets the staff read every board', () => {
    expect(boardAccess({ ...paidPlayer, staff: true, entered: false })).toMatchObject({
      canRead: true,
      canPost: false,
    });
  });
});

describe('boardIsOpen', () => {
  const day = 24 * 60 * 60_000;
  it('is open while the week runs and for three days after the winner', () => {
    expect(boardIsOpen({ status: 'open', winnerPublishedAtMs: null }, 0)).toBe(true);
    expect(boardIsOpen({ status: 'locked', winnerPublishedAtMs: null }, 0)).toBe(true);
    expect(boardIsOpen({ status: 'final', winnerPublishedAtMs: 0 }, 2 * day)).toBe(true);
    expect(boardIsOpen({ status: 'final', winnerPublishedAtMs: 0 }, 4 * day)).toBe(false);
    expect(boardIsOpen({ status: 'final', winnerPublishedAtMs: null }, 0)).toBe(false);
  });
});

describe('canChangeMessage and checkMessage', () => {
  const message = { playerId: 'p1', hidden: false, createdAtMs: 0 };
  it('allows your own post for ten minutes, never once hidden', () => {
    expect(canChangeMessage(message, 'p1', true, 9 * 60_000)).toBe(true);
    expect(canChangeMessage(message, 'p1', true, 11 * 60_000)).toBe(false);
    expect(canChangeMessage(message, 'p2', true, 0)).toBe(false);
    expect(canChangeMessage({ ...message, hidden: true }, 'p1', true, 0)).toBe(false);
    expect(canChangeMessage(message, 'p1', false, 0)).toBe(false);
  });

  it('trims a message and refuses an empty or too-long one', () => {
    expect(checkMessage('  Go Jags  ')).toEqual({ ok: true, text: 'Go Jags' });
    expect(checkMessage('   ').ok).toBe(false);
    expect(checkMessage('x'.repeat(501)).ok).toBe(false);
  });
});

describe('secondsToWait (D-109)', () => {
  it('counts down the 30 seconds after your last post', () => {
    expect(secondsToWait(null, 1_000)).toBe(0);
    expect(secondsToWait(0, 1_000)).toBe(29);
    expect(secondsToWait(0, 29_001)).toBe(1);
    expect(secondsToWait(0, 30_000)).toBe(0);
  });
});

describe('unreadCount (D-109)', () => {
  const m = (playerId: string, createdAtMs: number, hidden = false) => ({
    playerId,
    createdAtMs,
    hidden,
  });
  const posts = [m('p2', 100), m('p1', 200), m('p3', 300, true), m('p2', 400)];

  it('counts others’ posts since your last look, never your own or a hidden one', () => {
    expect(unreadCount(posts, 'p1', 150)).toBe(1);
    expect(unreadCount(posts, 'p1', 400)).toBe(0);
  });

  it('before your first look, every such post is new', () => {
    expect(unreadCount(posts, 'p1', null)).toBe(2);
    expect(unreadCount(posts, null, null)).toBe(3);
  });
});
