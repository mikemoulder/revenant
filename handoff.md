# Handoff

**As of:** (lock-and-load commit, see `git log -1`) · Oct 10 11:50 CEST · lock-and-load session

## Next step

Architecture is done: see `docs/architecture-brief.md` (TypeScript CLI, jest fixture, no
DB, no host). Still uncommitted.

Spike passed: the neatlogs session join works (see memory.md Lessons) and the repo is public.

Build order step 1: `src/types.ts`, `src/seams/entire.ts`, `src/replay.ts` running three
`verify` runs on a tiny jest repo. Load the claude-api skill before writing `src/seams/model.ts`.
neatlogs OAuth token expires roughly hourly; re-run the device login when the CLI says UNAUTHORIZED.

## Current status

**Working:** nothing yet. The repo holds the Entire setup and the workflow files.

**Deployed:** n/a (no URL required). Public repo: https://github.com/mikemoulder/revenant

**Build:** no code yet.

## Verified

```text
[x] no .env tracked, no secrets in history (init.sh scan)
[x] first commit 2026-10-10 11:07 CEST, after kickoff (09:00 CEST)
[x] .env.example is not ignored (git check-ignore)
[x] entire 0.11.4, neatlogs 0.2.0, node 22, python 3.12 on PATH
[ ] pytest / jest installed (neither on PATH)
[x] neatlogs traces list --session finds a Claude Code session (3 traces for 03edd784)
[x] entire checkpoint explain 05a4624 --json returns session_id, model, tokens
```

## Remaining work

The build order, with commit boundaries. Commit numbers are rough, not a quota.

```text
Phase              Build order step                                 ~Commits
Foundation         1  repo, config (test command, exam globs)        1-5
Walking skeleton   2  replay engine v1: worktrees + 3 verify runs,   6-12
                      neatlogs spans from the first run (keep traces)
The aha path       3  fixture repo, cases 1-6 via real sessions      13-26
                   4  v2: parent's exam restored; run before/after
                   5  checkpoint reading, claims, warrant w/ quote
Rest of the demo   6  ledger + restart, freeze reasons               27-36
                   7  coordinator: reverts newest first, HEAD check, PR
States + failure   8  stale via graph impact (SHOULD)                37-43
                   9  caught setup failure + retry, kill -9 resume
Hardening         10  cfo.ai plan from measured costs                44-52
                  11  dogfood run on this repo's history
                  12  hackathon.md, README, demo capture, quote post
```

## Context the next person needs

- Building in public is worth 15% of the score. Post the hero pair (the two `VERDICT:` lines) on day one, tagged #neatHack.
- Before kickoff, `../REVENANT.md` "Plan" planned some pre-event checks. Confirm the
  neatlogs session join with a real key before building on it.
