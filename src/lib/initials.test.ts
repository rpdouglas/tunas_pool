import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('uses the first and last name', () => {
    expect(initialsOf('Ryan Douglas')).toBe('RD');
    expect(initialsOf('Mary Ann van Dyke')).toBe('MD');
  });

  it('uses one letter for one name, and the start of an email', () => {
    expect(initialsOf('ryan')).toBe('R');
    expect(initialsOf('rpdouglas@gmail.com')).toBe('R');
    expect(initialsOf('ryan.douglas@gmail.com')).toBe('RD');
  });

  it('never returns an empty avatar', () => {
    expect(initialsOf('')).toBe('?');
  });
});
