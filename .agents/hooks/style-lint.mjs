// CLAUDE.md §4.10 (no hard-coded hex) and §5 (no `any` without a comment).
// PostToolUse must output {}, so findings are queued for style-report.mjs (PreInvocation).
import fs from 'node:fs';
import { readInput, out, findingsFile } from './lib.mjs';

const input = await readInput();
const args = input.toolCall?.args ?? {};
const file = String(args.TargetFile ?? '');
const text = String(args.CodeContent ?? args.ReplacementContent ?? '');

const inScope =
  /(^|\/)(src|shared|functions\/src)\/.*\.(ts|tsx)$/.test(file) &&
  !/\.test\.tsx?$/.test(file) &&
  !input.error;

if (inScope) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/#[0-9a-fA-F]{3,8}\b/.test(code) && /['"`]#[0-9a-fA-F]{3,8}\b/.test(code)) {
      found.push(`${file}: hard-coded hex color (CLAUDE.md §4.10). Use a token from tokens.css. Line: ${line.trim()}`);
    }
    if (/(:\s*any\b|\bas\s+any\b|<any>)/.test(code) && !/\/\/|\/\*/.test(line)) {
      found.push(`${file}: \`any\` without a comment explaining why (CLAUDE.md §5). Line: ${line.trim()}`);
    }
  });
  if (found.length) {
    const f = findingsFile(input);
    let prev = [];
    try {
      prev = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {}
    fs.writeFileSync(f, JSON.stringify([...prev, ...found].slice(-20)));
  }
}
out({});
