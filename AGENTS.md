# AGENTS.md — Tunas Weekly Football Pool Pick 'Em

> Antigravity entry point. The governance rules live in `CLAUDE.md` and are
> included below so there is one source of truth. **Do not copy rules into this
> file.** Edit `CLAUDE.md` and both agents pick up the change.

@[CLAUDE.md](CLAUDE.md)

---

## Antigravity addendum

Everything above applies to you as written. Where it says "Claude" or "subagents",
read it as you. What follows only maps the Claude workflow onto Antigravity.

### Customizations in this repo (`.agents/`)

| Kind | What | Enforces (CLAUDE.md) |
|---|---|---|
| Hooks | `.agents/hooks.json` | §6 deploy rules, §8 never-list, §3 docs-as-code, §4.10 / §5 style |
| Skill | `tunas-governance-audit` | §3 docs hierarchy: code and docs must agree |
| Skill | `persona-check` | §7 step 2 (Persona Check before building) |
| Skill | `sprint-close` | §7 steps 5-6 and the Definition of done |

Hooks are the hard backstop: if one blocks you, fix the cause. Do not look for a
way around it. If a block looks wrong, stop and ask Ryan.

### Subagents (§7 step 7)

Spawn with `define_subagent` / `invoke_subagent` when work is parallelizable.
Review every diff before merging. Role prompts:

- **rules-tests**: Writes `@firebase/rules-unit-testing` cases *before or alongside*
  any `firestore.rules` change, adds the matching row to the test matrix in
  `docs/FIRESTORE_RULES.md`, runs `npm run test:rules`. Never edits
  `firestore.rules` itself; reports what the rule must do.
- **ui-components**: Builds React components from `tokens.css` and
  `tailwind.preset.cjs` only (no hex, no default Tailwind palette), 48px targets,
  16px minimum text. Adds a `/styleguide` entry showing every state. Follows
  `docs/DESIGN_SYSTEM.md`. Runs `persona-check` first.
- **function-stubs**: Writes callable Cloud Functions in `functions/src/` that write
  `auditLog` via the Admin SDK, plus `*.int.test.ts` integration tests. Updates
  `docs/DATA_MODEL.md` in the same change. Uses `FIRESTORE_DATABASE_ID` from
  `shared/config.ts`.

### Environment notes carried over from Claude's memory

- The browser check is one `npm run test:smoke` run per screen change. Do not run
  or extend the parked `test:e2e:*` flows unless Ryan asks (D-066, D-082).
- Never start emulators as a bare background command; use `firebase emulators:exec`
  (a stray emulator holds port 8080 and breaks `test:rules`).
- If a run crashes with no cause in the code, report it and move on. Do not loop on
  the machine.

### MCP

No MCP servers are configured for this project, matching the Claude setup.
