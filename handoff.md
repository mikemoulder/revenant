# Handoff

**As of:** 3aff1d7 · Oct 10 12:30 CEST · build step 1 session

## Next step

Build order step 3: create the fixture repo `../revenant-fixture`. Start with
`entire enable -y --agent claude-code` and set `"commit_linking": "always"`. Then make a
human commit of a jest `charge.js` with tests, plus a `revenant.config.json`. Then make
**one** headless Claude Code commit (`claude -p "<case 1 prompt>"`). Confirm with
`entire checkpoint explain HEAD --json` that headless commits get a checkpoint before
building the other five cases. That is the top risk in `docs/architecture-brief.md`.

## Current status

**Working:** `node src/cli.ts replay <sha> --repo <path>` (v1). It replays a commit's own tests
against its parent's baseline in scratch worktrees, traces every step to neatlogs, and prints
a keep, revert or freeze verdict.

**Deployed:** n/a. Public repo: https://github.com/mikemoulder/revenant (main in sync)

**Build:** `npm run typecheck` green.

## Verified

```text
[x] v1 on a scratch jest repo (scratchpad, not committed): the test-editing commit cc619ac
    is KEPT (as committed: NO EFFECT, exam files: M charge.test.js). The v1 blind spot.
[x] by hand, commit code + parent's test file -> VERDICT: REGRESSION in 1 test (v2 will work)
[x] neatlogs trace 5c15bad6d22917d7c1f8469f30dac646: audit, 11 spans, OK, 35 s
[x] setup that exits 3 -> retried once -> FREEZE "replay environment failed twice", worktrees removed
[x] --json stdout is valid JSON (SDK logging held at WARN)
[x] no .env tracked, first commit after kickoff, entire/neatlogs/node on PATH
[ ] the official v1 "before" traces: these must come from the FIXTURE repo, not the scratch repo
```

## Remaining work

```text
Phase              Build order step                                       Status
Foundation         1  repo, types, config                                  done
Walking skeleton   2  replay engine v1, neatlogs spans                     done
The aha path       3  fixture repo, cases 1-6 via real sessions            NEXT
                   4  run v1 on fixture (keep traces) -> add v2 (parent's exam) -> rerun
                   5  checkpoint reading, claims, warrant w/ quote
Rest of the demo   6  ledger + restart, freeze reasons
                   7  coordinator: reverts newest first, HEAD check, PR
States + failure   8  stale via graph impact (SHOULD)
                   9  failure injection on demand, kill -9 resume
Hardening         10  cfo.ai plan from measured costs
                  11  dogfood run on this repo's history
                  12  hackathon.md, README, demo capture, quote post
```

## Context the next person needs

- v2 is deliberately NOT built yet. The before/after evidence needs v1 traces on the fixture first.
- One replay of a jest repo takes about 18 s, mostly `npm ci` in two worktrees. Fine for now.
- neatlogs read CLI: see memory.md Stack for the exact incantation (env -u, --project). The OAuth
  token expires about hourly.
- Building in public is worth 15%. A day-one post is due: the hero pair (two VERDICT lines),
  tagged #neatHack. It can come from the scratch repo output above until the fixture exists.
