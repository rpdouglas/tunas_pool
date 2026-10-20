// CLAUDE.md §6: never a bare `firebase deploy`; always `--project prod` and an
// explicit `--only`; never deploy storage or the (default) database without asking Ryan.
import { readInput, out } from './lib.mjs';

const input = await readInput();
const cmd = String(input.toolCall?.args?.CommandLine ?? '');

if (!/\bfirebase\b[^|;&]*\bdeploy\b/.test(cmd)) {
  out({ decision: 'allow' });
} else {
  const hasProject = /--project[ =]prod\b|(^|\s)-P[ =]?prod\b/.test(cmd);
  const only = cmd.match(/--only[ =]("[^"]*"|'[^']*'|\S+)/)?.[1]?.replace(/["']/g, '');
  if (!hasProject || !only) {
    out({
      decision: 'deny',
      reason:
        'CLAUDE.md §6: manual deploys must pass `--project prod` and an explicit `--only` list. Never run a bare `firebase deploy`.',
    });
  } else if (/\bstorage\b/.test(only) || /\(default\)/.test(cmd)) {
    out({
      decision: 'force_ask',
      reason:
        'CLAUDE.md §6: storage and the (default) database are shared with other apps. Do not deploy without asking Ryan.',
    });
  } else {
    out({ decision: 'allow' });
  }
}
