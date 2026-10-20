---
name: tunas-governance-audit
description: >-
  Audits the Tunas pool repo for docs-as-code drift: firestore.rules vs
  docs/FIRESTORE_RULES.md, shared types and functions vs docs/DATA_MODEL.md,
  ACTIVE_CYCLE and DECISIONS currency, and CLAUDE.md hard-never violations.
  Use before sprint planning, after a sprint close, before merging to main
  (which deploys to production), or when the user asks whether code and docs
  agree. Read-only: it reports and never edits.
---

# Tunas Governance Audit

CLAUDE.md header: "If code and docs disagree, stop and flag it. Do not silently pick one."
This skill is **read-only**. Produce a report; change nothing until Ryan picks fixes.
(This replaces the user-level `governance` skill, which is for another project and
expects files this repo does not have.)

## Step 1: Ingest

Read in full: `CLAUDE.md`, `docs/ACTIVE_CYCLE.md` (the top sprint), `docs/DECISIONS.md`
(headings and the last ~10 rows), `docs/PROJECT_PLAN.md` §7 (open decisions).
For bingo, `docs/BINGO_PLAN.md` holds the gates (G0 to G2) and sprint status.
If any is missing, report MISSING and stop.

## Step 2: Checks

**A. Rules vs doc (CLAUDE.md §3, "source is the file, sync the doc").**
Extract the rules code block in `docs/FIRESTORE_RULES.md` §2 and diff it against
`firestore.rules`:
```bash
awk '/^## 2\. Rules/{f=1} f&&/^```/{n++; next} f&&n==1{print} n==2{exit}' docs/FIRESTORE_RULES.md > /tmp/rules_doc.txt
diff <(sed 's/[[:space:]]*$//' firestore.rules) <(sed 's/[[:space:]]*$//' /tmp/rules_doc.txt)
```
Do the same for `storage.rules` vs §3 if present. Any diff is Critical.

**B. Test matrix coverage.** Every `match`/collection path in `firestore.rules`
should have a row in the §5 test matrix, and `tests/` should hold a rules test for it.
List collections in rules with no matrix row.

**C. Data model vs code.**
- Each collection in `docs/DATA_MODEL.md` §2 appears in `firestore.rules`
  (a collection with no rule is a **security gap**, Critical).
- Each `onCall` exported from `functions/src/index.ts` (or its modules) is listed in
  DATA_MODEL §5, or §11.5 for the `bingo*` callables (Weekly 649 Bingo); each function
  listed there exists in code.
- The bingo collections (`bingo/*`, `bingoMembers`, `bingoRedeemAttempts`, `bingoCards`,
  `bingoCycles` and its subcollections) are documented in DATA_MODEL §11, not §2-§3.
  Their rules tests are in `tests/rules/bingo.rules.test.ts` (matrix rows 67 to 80).
- Enums in §4 match the types in `shared/`.

**D. Hard-never list (CLAUDE.md §8), by grep.**
- Client code writing derived/protected fields: `grep -rnE "paymentStatus|claimedByUid|revealed|auditLog" src --include=*.ts --include=*.tsx` and inspect any write (`setDoc|updateDoc|addDoc`).
- `.env*` files or keys tracked: `git ls-files | grep -E "\.env|service-?account"` (only `.env.example`/`.env.development` placeholders are acceptable; flag the rest).
- Hard-coded hex outside tokens: `grep -rnE "['\"]#[0-9a-fA-F]{3,8}['\"]" src --include=*.ts --include=*.tsx | grep -v tokens`.
- Raw `getDoc`/`getDocs` in components (§5): `grep -rnE "\bgetDocs?\(" src/components src/features`.
- Firestore handles not using `FIRESTORE_DATABASE_ID`: `grep -rn "getFirestore(" src functions/src scripts`.

**E. Cycle currency.**
- Does `docs/ACTIVE_CYCLE.md` top sprint list the work in `git log --since` for the
  sprint, with unchecked items still honest?
- Every `D-nnn` referenced in code or ACTIVE_CYCLE exists in `DECISIONS.md`; decision
  numbers are contiguous and unique.
- Decisions marked Provisional appear under "Waiting on the commissioner".

**F. Parked scope.** Anything built that CLAUDE.md §10 lists as out of scope for v1.

## Step 3: Report

```
### Tunas Governance Audit — <date>
Files read: <list>

#### Critical (rules/doc drift, security gaps, hard-never violations)
[Check] | [file] | [what disagrees] 

#### Medium (matrix gaps, missing docs entries, undocumented functions)
#### Quality (stale ACTIVE_CYCLE, provisional decisions not listed)
#### Clean
#### Recommended fix order (top 5): [file] -> [change]
```
List every violation individually; do not summarize. End with:
`AUDIT COMPLETE. N violations. Tell me which to fix.`

When fixing: source of truth for rules is `firestore.rules` (sync the doc); for
everything else, ask Ryan which side is right. Record any non-obvious choice in
`docs/DECISIONS.md` with date and rationale.
