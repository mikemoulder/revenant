# Project memory

## What this is

Revenant catches commits where a coding agent got the tests to pass by editing the tests,
then reverts those commits. It replays each commit against its parent's tests through
`entire graph verify`. It reads the prompt from the commit's Entire checkpoint to decide
whether the test change was allowed. Its output is a ledger: keep, revert, stale or
freeze. Source design: `../REVENANT.md`.

## Stack

```text
language / runner   TypeScript on Node 22 CLI; jest for the fixture. See docs/architecture-brief.md
neatlogs read CLI   needs --host https://app.neatlogs.com and NEATLOGS_CONFIG_DIR=~/.config/neatlogs-cli
                    (the Claude Code plugin owns ~/.config/neatlogs/config.json in another format;
                    the CLI rejects it as UNSAFE_CONFIG_FILE). The ingest key cannot read traces,
                    and NEATLOGS_API_KEY in env OVERRIDES the OAuth login: run the CLI with
                    `env -u NEATLOGS_API_KEY ... --project 6501ac4a-c89a-4644-87e3-731a7c07a3d9`
repo                https://github.com/mikemoulder/revenant (public). Entire pushes checkpoint refs on push
Entire CLI          0.11.4, ~/.local/bin/entire. commit_linking: always (.entire/settings.json)
neatlogs CLI        0.2.0. Claude Code plugin set up globally (~/.claude/settings.json)
host                none needed. CLI plus a committed ledger; GitHub for the revert PR
```

## Architecture

The coordinator lists the commits since a watermark and skips Revenant's own ledger commits. It hands
one commit to each worker. Workers share no memory, and every replay is pinned to fixed SHAs,
so workers run in parallel. The coordinator applies reverts newest first on a scratch
copy of HEAD.

```text
commit -> trailer -> checkpoint -> sessions/prompts -> neatlogs trace (session id join)
       -> replays: parent baseline | as committed | commit code + parent's exam
       -> warrant (model, must quote) -> stale (graph impact) -> verdict -> ledger row
```

## Decisions

```text
Four verdicts: keep, revert, stale, freeze. No "contested"
  why:        Entire attribution is per commit, with no line ranges, so a mixed commit freezes
  instead of: hunk splitting (cut)

Replays compare commit vs parent, never vs current tree
  why:        a later commit's breakage must not get this one reverted

The prompt is the warrant
  why:        same diff, different prompt, different verdict (fixture cases 2 vs 3)

Agent testimony is evidence, not a verdict
  why:        a sloppy claim triggers a replay; only the replay decides

Before/after = Revenant v1 (trusts commit's own tests, misses case 2) vs v2 (parent's exam)
  instead of: comparing upstream agent runs

Freeze is a normal outcome, not an exception
```

Decision order (deterministic):
1. No checkpoint: freeze.
2. Replay env fails: retry once, then freeze.
3. Own exam regresses: revert*.
4. Own exam passes but the parent's exam regresses: authorized means keep, not authorized
   means revert*, and no quote means freeze.
5. A later commit changed a callee: stale.
6. Otherwise keep.

\* Revert only if the commit is not mixed, the revert applies cleanly, and the exam is green at HEAD afterwards. Otherwise freeze.

## Scope

```text
MUST    3 replays via verify, checkpoint reading, warrant, keep/revert/freeze,
        ledger with restart, one revert PR, neatlogs on every run, cfo.ai plan, demo
SHOULD  stale, revert check at HEAD, testimony from neatlogs spans, case 6, dogfood run
NICE    cheaper-model cost comparison, dissent comments, re-check when HEAD moves
CUT     hunk splitting, coverage rule, co-change, GitHub App, dashboard, writing tests,
        agents other than Claude Code
Floor:  cases 2, 3, 5, the ledger, one PR, neatlogs, cfo.ai
```

## Constraints

```text
All code written Oct 10 to 12        no pre-existing code; fixture repo built after kickoff
Demo video <= 3 min                  must cover arch/impl/runtime/reasoning/result per tool
Public repo                          no remote yet; must be public before submission
verify exits 0 on regression         parse the VERDICT: line, never the exit code
Unknown runner                       freeze, never revert on exit codes alone
kill -9 loses unsent spans           neatlogs recovery evidence comes from a caught failure
cfo.ai free AI credits are one-time  build the plan once, late, with measured costs
```

## Lessons

```text
Entire's files_touched only lists files edited by Write/Edit    shell-written files are absent
  (commit 05a4624: .env.example missing)                      so fixture sessions edit with Write/Edit,
                                                               and attribution may read as mixed
neatlogs join CONFIRMED: `traces list --session <claude id>`    one trace per user prompt, not per session.
  returns traces with sessionId = Entire's session_id         pick the trace whose [startedAt, completedAt]
                                                               holds the commit time (05a4624 -> 8bafa749)
Push of a commit with a NEW checkpoint fails: "main -> main    Entire's pre-push hook pushes the checkpoint ref
  (failed)". Seen on 05a4624 and f363a59                      fine, main is rejected. Second push succeeds.
                                                               Always: `git push || git push`
verify --setup "<cmd>" that FAILS is ignored;                   Revenant runs setup itself (src/replay.ts),
  verify runs the tests anyway                                 so the failure is a real ERROR span + retry
verify wording: PASS | NO EFFECT | REGRESSION in N |           "(exit N)" forms are exit-code only -> unknown.
  PASS (exit 0) | FAIL (exit N)                                an unchanged suite says NO EFFECT, not PASS
neatlogs public API (raw-spans) omits span attributes           ids are duplicated into span input
neatlogs SDK logs INFO to stdout, level read at import          NEATLOGS_LOG_LEVEL=WARN before dynamic import
```

## What is real, what is staged

**Real:** checkpoints, traces, replays, verdicts, the revert PR, the dogfood run.
**Staged and disclosed:** the upstream agent's "make CI green fast" policy prompt, the
fixture repo, and the test command and exam globs in config.
