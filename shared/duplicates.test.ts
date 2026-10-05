import { findDuplicateFlags, flagsByPlayer, similarNames, type PersonInfo } from './duplicates';

const p = (
  playerId: string,
  displayName: string,
  phone: string | null = null,
  email: string | null = null,
): PersonInfo => ({
  playerId,
  displayName,
  phone,
  email,
});

describe('similarNames', () => {
  it('catches nicknames, spelling slips, and initials', () => {
    expect(similarNames('Bob Smith', 'Robert Smith')).toBe(true);
    expect(similarNames('Jon Smith', 'John Smith')).toBe(true);
    expect(similarNames('Dale D.', 'Dale Douglas')).toBe(true);
    expect(similarNames('Dale', 'Dale D.')).toBe(true);
    expect(similarNames('Mike R', 'Michael Roy')).toBe(true);
    expect(similarNames('Jose Pérez', 'Jose Perez')).toBe(true);
  });

  it('does not flag different people who happen to share a first name or initial', () => {
    expect(similarNames('Alex R.', 'Alex T.')).toBe(false);
    expect(similarNames('Dale D.', 'Dave D.')).toBe(false);
    expect(similarNames('Mike Smith', 'Mark Smith')).toBe(false);
    expect(similarNames('Jen Lee', 'Ken Lee')).toBe(false);
    expect(similarNames('Sam Brown', 'Sam Green')).toBe(false);
  });
});

describe('findDuplicateFlags', () => {
  it('flags the same phone number, the same email (any case), and the same name', () => {
    const flags = findDuplicateFlags([
      p('a', 'Dale D.', '+16135550123'),
      p('b', 'Someone Else', '+16135550123'),
      p('c', 'Ann', null, 'Ann@Example.com'),
      p('d', 'Annie', null, 'ann@example.com '),
      p('e', 'Troy T.'),
      p('f', 'troy t'),
    ]);
    expect(flags).toEqual([
      { playerIds: ['a', 'b'], reasons: ['phone'] },
      { playerIds: ['c', 'd'], reasons: ['email'] },
      { playerIds: ['e', 'f'], reasons: ['name'] },
    ]);
  });

  it('combines reasons and lists each pair once', () => {
    const flags = findDuplicateFlags([
      p('a', 'Bob Smith', '+16135550123'),
      p('b', 'Robert Smith', '+16135550123'),
    ]);
    expect(flags).toEqual([{ playerIds: ['a', 'b'], reasons: ['phone', 'similar_name'] }]);
  });

  it('flags nobody when nothing matches, and ignores missing phones and emails', () => {
    expect(findDuplicateFlags([p('a', 'Dale D.'), p('b', 'Jen K.'), p('c', 'Troy T.')])).toEqual(
      [],
    );
    expect(
      findDuplicateFlags([p('a', 'Dale D.', null, null), p('b', 'Jen K.', null, null)]),
    ).toEqual([]);
  });

  it('groups flags by player for the queue rows', () => {
    const flags = findDuplicateFlags([
      p('a', 'Dale D.', '+16135550123'),
      p('b', 'Jen K.', '+16135550123'),
    ]);
    expect(flagsByPlayer(flags, { a: 'Dale D.', b: 'Jen K.' })).toEqual({
      a: [{ otherPlayerId: 'b', otherName: 'Jen K.', reasons: ['phone'] }],
      b: [{ otherPlayerId: 'a', otherName: 'Dale D.', reasons: ['phone'] }],
    });
  });
});
