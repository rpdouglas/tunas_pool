// Shared helpers for Antigravity hook scripts (stdin JSON in, stdout JSON out).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

export async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}

export function repoRoot(input) {
  return input.workspacePaths?.[0] ?? path.resolve(process.cwd(), '..');
}

export function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

export function findingsFile(input) {
  return path.join(os.tmpdir(), `tunas-style-${input.conversationId ?? 'unknown'}.json`);
}
