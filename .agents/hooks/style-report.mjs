// Injects findings queued by style-lint.mjs before the next model call.
import fs from 'node:fs';
import { readInput, out, findingsFile } from './lib.mjs';

const input = await readInput();
const f = findingsFile(input);
try {
  const found = JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.unlinkSync(f);
  if (found.length) {
    out({
      injectSteps: [
        {
          ephemeralMessage:
            'Style lint found problems in code you just wrote. Fix them before continuing:\n- ' +
            found.join('\n- '),
        },
      ],
    });
  } else out({});
} catch {
  out({});
}
