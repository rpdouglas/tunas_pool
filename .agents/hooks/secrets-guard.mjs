// CLAUDE.md §8: never commit `.env*` files or service account keys.
import { readInput, out } from './lib.mjs';

const input = await readInput();
const cmd = String(input.toolCall?.args?.CommandLine ?? '');

const isStage = /\bgit\b[^|;&]*\b(add|commit\s+[^|;&]*-\w*a|stage)\b/.test(cmd);
const risky = cmd
  .split(/\s+/)
  .filter(
    (t) =>
      /(^|\/)\.env(\.[\w.-]+)?$/.test(t) && !/\.env\.example$/.test(t)
        ? true
        : /service-?account.*\.json$/i.test(t) || /(^|\/)serviceAccount.*\.json$/.test(t),
  );

if (/\bgit\b[^|;&]*\badd\b/.test(cmd) && risky.length) {
  out({
    decision: 'deny',
    reason: `CLAUDE.md §8: never commit .env* files or service account keys (${risky.join(', ')}).`,
  });
} else if (isStage && /\bgit\b[^|;&]*\badd\b[^|;&]*(\s-f\b|--force)/.test(cmd)) {
  out({
    decision: 'force_ask',
    reason: '`git add --force` can bypass .gitignore (secrets, exports). Confirm with Ryan.',
  });
} else {
  out({ decision: 'allow' });
}
