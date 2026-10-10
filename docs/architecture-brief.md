# Architecture brief: Revenant

## Summary

```text
Style:        one Node process. A deterministic pipeline with model judgments at fixed points
Stack:        TypeScript on Node 22, jest for the fixture, no database, no host
Deploys:      none. The demo is the CLI, the committed ledger and one revert PR
State:        .revenant/ledger.jsonl (committed), scratch worktrees in .revenant/worktrees/
```

Deviation from the default Next.js stack: no UI is on the demo path, and an audit runs
real test suites for minutes, longer than any function timeout. It is a CLI, and that is
the whole system.

## The demo path

| # | Operator does | Revenant does | Persists |
|---|---|---|---|
| 1 | `revenant audit --repo ../revenant-fixture` | Lists the commits since the watermark and skips its own ledger commits | `running` rows |
| 2 | (watches) | Resolve: trailer to checkpoint to sessions and prompts to neatlogs trace | ids on the row |
| 3 | (watches) | **Replay x3 via `entire graph verify`**: parent baseline, as committed, commit + parent's exam | both `VERDICT:` lines |
| 4 | (watches) | Warrant: the model reads the prompts and must quote a line, or the item freezes | warrant + quote |
| 5 | (watches) | Stale: `graph impact` callees, commit vs HEAD | stale flag |
| 6 | (reads ledger) | Coordinator: reverts newest first on a scratch HEAD, exam green check, `gh pr create` | verdict, undo_pr |

**Aha step: 3.** The two `VERDICT:` lines side by side. It gets the retry (a setup
failure retries once, then freezes) and the clearest output. The rest gets none.

## Diagram

```text
                     revenant audit (src/cli.ts)
                               │
                     [coordinator]  src/coordinator.ts ── gh pr create
                               │ one commit per worker, no shared memory
                       [worker]  src/worker.ts
            ┌──────────────┼───────────────┬──────────────┐
            ▼              ▼               ▼              ▼
     [entire seam]   [replay]         [model seam]   [neatlogs seam]
     src/seams/      src/replay.ts    src/seams/     src/seams/
     entire.ts       worktrees +      model.ts       trace.ts
     checkpoint,     3x verify        warrant,       spans out,
     impact                           claims         traces in
                               │
                     [ledger]  src/ledger.ts -> .revenant/ledger.jsonl
```

## Agent design (components.agent)

Revenant is not a free tool loop, on purpose. The model is called at three fixed points
(claims, warrant, PR text), each one a single structured call. It never picks tools.

```text
Tools the model can call:    none. It returns JSON: {answer, quote} or {claims:[{text, quote}]}
Authorization boundary:      ordinary code decides every action. The model's output only
                             feeds the decision table; a missing or non-verbatim quote = freeze
Irreversible step:           none in-repo. Reverts happen on a scratch branch and ship as a
                             PR; a human merges. Never pushes to the audited main
Termination:                 bounded by commit count; each verify run has a 120 s timeout;
                             replay env failure retries once then freezes; restart resumes
                             `running` rows with attempts + 1
```

## Data model

```text
LedgerRow   action, parent, checkpoint, session, original_trace, audit_trace, exam,
            baseline, as_committed, original_exam, warrant, testimony, verdict,
            reason, attempts, blast_radius, undo_pr, status (running | done)
```

**Rule applied:** each field is shown in the demo, the PR body or the ledger screenshot.

## Shared types

`src/types.ts`, committed first:

```ts
export type Verdict = "keep" | "revert" | "stale" | "freeze";
export type VerifyResult = { verdict: "PASS" | "REGRESSION" | string; line: string; newlyFailing: string[] };
export type Warrant = { answer: "authorized" | "not_authorized" | "unclear"; quote: string | null };
```

## External dependencies and their seams

| Dependency | Used for | Fixture | If it dies on stage |
|---|---|---|---|
| Entire CLI 0.11.4 | checkpoints, verify, impact | n/a, local binary | not on PATH: hooks go silent. Check `entire version` first |
| Anthropic API | claims, warrant, PR text | recorded per prompt hash in `fixtures/model/` | `REVENANT_MODEL=fixture` replays recordings |
| neatlogs SDK (export) | spans for every audit | debug log `spans_raw_optimized.log` | no key: export off, audit still runs |
| neatlogs CLI (read) | join session to trace | recorded JSON | trace ids blank on the row; verdict unaffected |
| gh | revert PR | none | PR body written to `.revenant/pr/<sha>.md` |

## Timeout budget

```text
Host limit:         none (local process)
Longest operation:  one replay = setup (npm ci in the worktree) + jest, about 5 to 20 s
Shape:              sequential workers for the demo (watchable). Parallel is a flag, not a need
```

## Security boundaries

```text
Secrets:            .env only (NEATLOGS_API_KEY, ANTHROPIC_API_KEY). Never in the ledger or PR
Audited code:       runs only inside .revenant/worktrees/, never in the operator's checkout
Push rights:        a branch and a PR. Never main
```

## Build order (risk first)

```text
0  spike: neatlogs session join (traces list --session)       DONE: one trace per prompt, match by commit time
1  types.ts, config, seams/entire.ts, replay.ts: 3 verify runs  -> the aha, on a tiny jest repo
2  neatlogs spans around every replay from the first run (keep the v1 traces)
3  fixture repo ../revenant-fixture, cases 1 to 6 via real headless sessions
4  v2: parent's exam. Run v1 vs v2 on the fixture: the before/after
5  checkpoint reading, claims, warrant with the quote check
6  ledger + restart; freeze reasons
7  coordinator: reverts newest first, HEAD check, one PR
8  stale via graph impact (SHOULD)  9  failure injection  10 cfo.ai  11 dogfood  12 demo
```

## Risks

| Risk | Detected by | Fallback |
|---|---|---|
| Headless `claude -p` commits get no checkpoint | first fixture session, step 3 | interactive sessions for the fixture |
| neatlogs OAuth token expires (about 1 h) mid-audit | UNAUTHORIZED from the CLI | trace ids blank on the row, verdict unaffected; re-login |
| The upstream agent refuses to cheat | first case 2 roll | re-roll, cheaper model; disclose |
| Files written via shell are missing from Entire's `files_touched` | observed on commit 05a4624 | fixture sessions edit with Write/Edit only |
| `graph impact` misses callers | stale check | stale is SHOULD; cut it |

## Cut list (in order)

```text
1. dissent comments on stale commits
2. cheaper-model cost comparison
3. stale check entirely
4. testimony matching against neatlogs spans (keep the claims, drop the span match)
5. parallel workers
```
