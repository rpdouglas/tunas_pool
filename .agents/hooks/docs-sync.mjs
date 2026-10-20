// CLAUDE.md §3: "Any schema, rule, or function-contract change updates the matching
// doc in the same commit." Blocks stopping while code changed with no matching doc.
import { readInput, out, repoRoot, git } from './lib.mjs';

const input = await readInput();
const MAX_NUDGES = 2; // never trap the agent in a loop

if (input.terminationReason !== 'NO_TOOL_CALL' || (input.executionNum ?? 1) > MAX_NUDGES) {
  out({});
} else {
  const root = repoRoot(input);
  const files = git(root, ['status', '--porcelain'])
    .split('\n')
    .map((l) => l.slice(3).trim().replace(/^.* -> /, ''))
    .filter(Boolean);

  const isTest = (f) => /\.(test|int\.test)\.tsx?$|(^|\/)tests?\//.test(f);
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
