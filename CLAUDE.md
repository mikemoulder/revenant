# Revenant

Revenant audits the commits coding agents make. When an agent edits a test, it reads the prompt to decide whether that was allowed, and it reverts commits that break their own tests. CI can't do either. It is for teams that let coding agents commit.

Hackathon: neatHack. Submission window: Oct 12, 7:00 to 11:55 PM IST (15:30 to 20:25 CEST).
Feature freeze: **Oct 12, 4:00 PM IST (12:30 CEST)**. After that, only fixes, the demo video, the README and evidence.

The full design lives in `../REVENANT.md` (outside the repo). The durable parts are in `memory.md`.

## Before starting work

Read `handoff.md` first, then check it against the repo (`git log --oneline -5`,
`git status --porcelain`). If they disagree, trust the repo. `memory.md` holds the
durable project knowledge, so check it before rediscovering anything.

## The product rule (never violate)

Revenant never proposes a new feature. It only keeps, reverts, or marks a decision stale
or frozen. If it cannot prove the original decision wrong, it does not guess. A missing
checkpoint freezes the item. A mixed human and agent commit is never reverted. A model
judgment that does not quote its evidence becomes a freeze.

## Commands

TypeScript run directly by Node 22 (no build step). Architecture: `docs/architecture-brief.md`.

```bash
npm run typecheck                            # cheapest useful check, before every commit
node src/cli.ts audit <sha>... --repo <path> [--mode v1|v2] [--json]   # exam from <path>/revenant.config.json
git push || git push                         # first push after a new checkpoint fails, see memory.md

# replay engine (verify exits 0 even on a regression: read the VERDICT: line)
entire graph verify --record-baseline        # at the parent
entire graph verify --pre-edit-baseline      # at the commit
entire graph impact --symbol <name>          # callees, for stale and blast radius
entire checkpoint explain <sha> --json       # checkpoint metadata
entire checkpoint explain <sha> --transcript --session-index N
neatlogs traces list --session <claude-session-id>
neatlogs traces raw-spans <trace-id>
```

No deployed URL is required. The demo is the CLI and the ledger, recorded on video.

## The demo path

These files are what gets judged. Verify changes to them with a real run on the fixture, not just a green build:

```text
src/replay.ts           verify runs in scratch worktrees (.revenant/worktrees/), retry once
src/decide.ts           the decision table. v1 today; v2 adds the parent's exam
src/seams/entire.ts     verify wrapper + VERDICT parser (exit code is always 0)
src/seams/trace.ts      neatlogs spans: every step named, ids in attributes AND input
src/cli.ts              entry point
not yet                 worker (resolve, warrant), coordinator, ledger
```

## Sponsor tools are evidence, keep them on

- **Entire** is on for every session. Its `Entire-Checkpoint` and `Entire-Attribution`
  trailers are judged evidence and the dogfood run audits them. Never strip them, and
  never run `entire disable` in this repo. Do that only in the fixture repo, for case 5.
- **neatlogs**: give every span a `name`, put the commit and checkpoint IDs in span
  attributes, and call `flush()` at exit. Keep the v1 traces, because the before/after
  comparison needs them.

## Working stance

Slow, steady, sharp. Take the time to understand; do not spend time on work that does
not change the outcome.

- **Inspect before modifying.** Find the file, understand it, check its callers, then
  make the smallest change that works.
- **Preserve what works.** Ugly and running beats clean and broken.
- **Verify before reporting.** Run the cheapest check first, then a targeted test, then a
  real run on the fixture. Never say a change works without having checked it.
- **One change at a time when debugging.** Observe, locate, form a hypothesis, change one
  thing, verify.
- **Stop after two failed attempts.** Write it in `handoff.md` under Do not repeat and move on.
- **Protect the scope.** Before any code, sort a new idea into MUST, SHOULD, NICE or CUT,
  using the lists in `memory.md`. If behind at hour 24, drop SHOULD.

## Communication

Plain language: Found, Changed, Verified, Next. Keep the length proportional to the change.

## Before ending a session

Verify, commit, then update `handoff.md` with the exact stopping point and the one next
step. Update it at every checkpoint, not only at session end. Someone who was not here
should be able to start in under two minutes.

## Never

- Commit a secret, a `.env` file, or a private neatlogs trace export.
- Add a `Co-Authored-By` naming a tool, a generated-by footer, or a robot emoji. Entire's
  own trailers are different. They stay.
- Use em dashes in the README, docs, commit messages or comments.
- Write a checkpoint by hand, or write a test for the code under audit.
- Commit `.revenant/worktrees/`.
- Refactor after hour 20 (Oct 11, 8:30 AM IST).
