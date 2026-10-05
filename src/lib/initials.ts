/** Two letters for the avatar: "Ryan Douglas" gives RD, "Ryan" gives R, an email gives its first letter. */
export function initialsOf(name: string): string {
  const words = name
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters =
    words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?')[0];
  return letters.toUpperCase();
}
