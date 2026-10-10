#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { decideV1 } from "./decide.ts";
import { replay } from "./replay.ts";
import { subjectOf } from "./seams/git.ts";
import { initTracing, shutdownTracing, step } from "./seams/trace.ts";
import { ReplayEnvError, type Decision, type ExamConfig, type ReplayResult } from "./types.ts";

const USAGE = `usage: revenant replay <commit>... --repo <path> [--config <file>] [--json]

Replays each commit against its parent with entire graph verify and prints the verdict.
The exam (test command, setup, exam globs) comes from <repo>/revenant.config.json.`;

const WORK_ROOT = fileURLToPath(new URL("../.revenant/worktrees/", import.meta.url));

function loadConfig(path: string): ExamConfig {
  if (!existsSync(path)) throw new Error(`no exam config at ${path}`);
  const cfg = JSON.parse(readFileSync(path, "utf8")) as ExamConfig;
  if (!cfg.test || !Array.isArray(cfg.exam) || cfg.exam.length === 0) {
    throw new Error(`${path} needs "test" and a non-empty "exam" list`);
  }
  return cfg;
}

function print(rev: string, subject: string, r: ReplayResult | null, d: Decision): void {
  const row = (k: string, v: string) => console.log(`  ${k.padEnd(18)}${v}`);
  console.log(`\n${r ? r.commit.slice(0, 7) : rev}  ${subject}`);
  if (r) {
    row("parent baseline", r.baseline);
    row("as committed", r.asCommitted.line);
    row("exam files", r.examFilesChanged.join(", ") || "none changed");
    row("attempts", String(r.attempts));
  }
  row("verdict (v1)", `${d.verdict.toUpperCase()}  ${d.reason}`);
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      repo: { type: "string" },
      config: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...revs] = positionals;
  if (values.help || command !== "replay" || revs.length === 0 || !values.repo) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }
  if (existsSync(".env")) process.loadEnvFile(".env");

  const repo = resolve(values.repo);
  const cfg = loadConfig(values.config ? resolve(values.config) : resolve(repo, "revenant.config.json"));

  await initTracing();
  try {
    const results = await step("audit", "WORKFLOW", { "revenant.repo": repo, "revenant.mode": "v1", "revenant.commits": revs.length }, async () => {
      const out = [];
      for (const rev of revs) {
        const subject = await subjectOf(repo, rev);
        let r: ReplayResult | null = null;
        let d: Decision;
        try {
          r = await replay(repo, rev, cfg, WORK_ROOT);
          d = decideV1(r);
        } catch (err) {
          if (!(err instanceof ReplayEnvError)) throw err;
          d = { verdict: "freeze", reason: `replay environment failed twice: ${err.message}` };
        }
        if (!values.json) print(rev, subject, r, d);
        out.push({ rev, subject, replay: r, decision: d });
      }
      return out;
    });
    if (values.json) console.log(JSON.stringify(results, null, 2));
    return 0;
  } finally {
    await shutdownTracing();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`revenant: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  },
);
