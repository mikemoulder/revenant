#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { auditCommit, type AuditResult } from "./audit.ts";
import { initTracing, shutdownTracing, step } from "./seams/trace.ts";
import type { ExamConfig, Mode } from "./types.ts";

const USAGE = `usage: revenant audit <commit>... --repo <path> [--mode v1|v2] [--config <file>] [--json]

Puts each commit on trial and prints a verdict: keep, revert, stale or freeze.
v1 trusts the commit's own tests, as CI does. v2 (default) reads the commit's Entire
checkpoint, also runs the parent's tests on the commit's code, and when the commit changed
behaviour its old tests pinned, asks whether the prompt authorized it (quoting the prompt).
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

function print(a: AuditResult, mode: Mode): void {
  const row = (k: string, v: string) => console.log(`  ${k.padEnd(18)}${v}`);
  const r = a.replay;
  const d = a.decision;
  console.log(`\n${a.commit.slice(0, 7)}  ${a.subject}`);
  if (mode === "v2") {
    const s = a.checkpoint?.sessions[0];
    row("checkpoint", a.checkpoint ? `${a.checkpoint.id} (${s?.agent}, ${s?.model})` : "none");
    if (s?.prompts[0]) row("prompt", JSON.stringify(s.prompts[0]));
  }
  if (r) {
    row("parent baseline", r.baseline);
    row("as committed", r.asCommitted.line);
    if (mode === "v2") row("parent's exam", r.originalExam?.line ?? "not needed, no exam files changed");
    row("exam files", r.examFilesChanged.join(", ") || "none changed");
    row("attempts", String(r.attempts));
  }
  if (a.warrant) row("warrant", `${a.warrant.answer}${a.warrant.quote ? `: "${a.warrant.quote}"` : ""} (${a.warrant.model})`);
  row(`verdict (${mode})`, `${d.verdict.toUpperCase()}  ${d.reason}`);
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      repo: { type: "string" },
      config: { type: "string" },
      mode: { type: "string", default: "v2" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...revs] = positionals;
  if (values.help || (command !== "audit" && command !== "replay") || revs.length === 0 || !values.repo) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }
  const mode = values.mode as Mode;
  if (mode !== "v1" && mode !== "v2") {
    console.error(`--mode must be v1 or v2, got ${values.mode}`);
    return 2;
  }
  if (existsSync(".env")) process.loadEnvFile(".env");

  const repo = resolve(values.repo);
  const cfg = loadConfig(values.config ? resolve(values.config) : resolve(repo, "revenant.config.json"));

  await initTracing();
  try {
    const results = await step("audit", "WORKFLOW", { "revenant.repo": repo, "revenant.mode": mode, "revenant.commits": revs.length }, async () => {
      const out = [];
      for (const rev of revs) {
        const a = await auditCommit(repo, rev, cfg, WORK_ROOT, mode);
        if (!values.json) print(a, mode);
        out.push({ rev, ...a });
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
