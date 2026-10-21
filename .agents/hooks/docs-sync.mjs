// CLAUDE.md §3: "Any schema, rule, or function-contract change updates the matching
// doc in the same commit." Blocks stopping while code changed with no matching doc.
// Also (D-136): a screen changed while the guide page that describes it (its `covers:`) did not.
import fs from 'node:fs';
import path from 'node:path';
import { readInput, out, repoRoot, git } from './lib.mjs';

/** Guide pages whose `covers:` paths include a changed file, when neither the page nor a shot changed. */
function staleGuidePages(root, files) {
  const dir = path.join(root, 'src/features/help/pages');
  let pages = [];
  try {
    pages = fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.mdx'));
  } catch {
    return [];
  }
  return pages
    .map((f) => {
      const rel = `src/features/help/pages/${f}`;
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const list = (key) =>
        (new RegExp(`^${key}:\\s*\\[(.*)\\]`, 'm').exec(text)?.[1] ?? '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
      const prefixes = list('covers');
      const shotsChanged = list('screens').some((n) =>
        files.includes(`public/guide/shots/${n}.webp`),
      );
      const touched = files.some(
        (c) =>
          !isTestFile(c) && prefixes.some((p) => c === p || (p.endsWith('/') && c.startsWith(p))),
      );
      return touched && !files.includes(rel) && !shotsChanged ? rel : null;
    })
    .filter(Boolean);
}

function isTestFile(f) {
  return /\.(test|int\.test)\.tsx?$|(^|\/)tests?\//.test(f);
}

const input = await readInput();
const MAX_NUDGES = 2; // never trap the agent in a loop

if (input.terminationReason !== 'NO_TOOL_CALL' || (input.executionNum ?? 1) > MAX_NUDGES) {
  out({});
} else {
  const root = repoRoot(input);
  const files = git(root, ['status', '--porcelain', '-uall'])
    .split('\n')
    .map((l) =>
      l
        .slice(3)
        .trim()
        .replace(/^.* -> /, ''),
    )
    .filter(Boolean);

  const isTest = isTestFile;
  const rulesChanged = files.includes('firestore.rules');
  const contractChanged = files.some(
    (f) => /^(shared|functions\/src)\/.*\.ts$/.test(f) && !isTest(f) && !/testSupport/.test(f),
  );
  const docs = files.filter((f) => f.startsWith('docs/'));
  const has = (name) => docs.includes(`docs/${name}`);

  const missing = [];
  if (rulesChanged && !has('FIRESTORE_RULES.md'))
    missing.push('docs/FIRESTORE_RULES.md (must match firestore.rules)');
  if (contractChanged && !has('DATA_MODEL.md'))
    missing.push('docs/DATA_MODEL.md (if a schema or function contract changed)');
  if ((rulesChanged || contractChanged) && !has('ACTIVE_CYCLE.md'))
    missing.push('docs/ACTIVE_CYCLE.md (status and what you learned)');

  const guide = staleGuidePages(root, files);
  if (guide.length)
    missing.push(
      `${guide.join(', ')} (the in-app guide describes screens you changed: check the words and \`reviewed\`, then \`npm run guide:shots\` if the screen looks different)`,
    );

  if (missing.length) {
    out({
      decision: 'continue',
      reason:
        'CLAUDE.md §3 docs-as-code: code changed but these docs were not updated: ' +
        missing.join('; ') +
        '. Update them, or if a change genuinely needs no doc change, say so explicitly in your final message and record any non-obvious decision in docs/DECISIONS.md.',
    });
  } else out({});
}
