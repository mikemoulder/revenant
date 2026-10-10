import { exec } from "./exec.ts";
import { ReplayEnvError, type VerifyResult } from "../types.ts";

const VERIFY_TIMEOUT_MS = 120_000;

/**
 * Read verify's output. Its exit code is 0 even on a regression, so only the
 * `VERDICT:` line counts. Wording seen in entire-graph 0.4.0:
 *   PASS (exit 0) | NO EFFECT | REGRESSION in N tests: ... | FAIL (exit N)
 * The "(exit N)" forms only appear when the runner was not parsed, so they are exit-code only.
 * Anything unrecognised is "unknown", which downstream becomes a freeze.
 */
export function parseVerify(text: string): VerifyResult {
  const line = text.split("\n").find((l) => l.startsWith("VERDICT:"))?.trim() ?? "";
  const exitCodeOnly = /exit-code only|exit-code-only/.test(text) || /^VERDICT: (PASS|FAIL) \(exit \d+\)/.test(line);
  const failingLine = text.split("\n").find((l) => l.startsWith("NEWLY FAILING"));
  const newlyFailing = failingLine
    ? failingLine.replace(/^NEWLY FAILING \(\d+\):\s*/, "").split(/,\s*(?=\.\/)/).filter(Boolean)
    : [];

  let outcome: VerifyResult["outcome"] = "unknown";
  if (!exitCodeOnly) {
    if (/^VERDICT: REGRESSION\b/.test(line)) outcome = "regression";
    else if (/^VERDICT: (PASS|NO EFFECT)\b/.test(line)) outcome = "holds";
  }
  return { outcome, line, newlyFailing, exitCodeOnly };
}

interface VerifyArgs {
  repo: string;
  test: string;
  recordBaseline?: string;
  preEditBaseline?: string;
}

async function runVerify(args: VerifyArgs): Promise<string> {
  const flags = ["graph", "verify", "--repo", args.repo, "--test", args.test];
  if (args.recordBaseline) flags.push("--record-baseline", args.recordBaseline);
  if (args.preEditBaseline) flags.push("--pre-edit-baseline", args.preEditBaseline);
  const r = await exec("entire", flags, { timeoutMs: VERIFY_TIMEOUT_MS });
  if (r.timedOut) throw new ReplayEnvError("verify", `timed out after ${VERIFY_TIMEOUT_MS / 1000}s`);
  if (r.code !== 0) throw new ReplayEnvError("verify", r.stderr.trim() || `exited ${r.code}`);
  return r.stdout;
}

/** Record the pristine-tree result. Returns the `BASELINE RECORDED` line. */
export async function recordBaseline(repo: string, test: string, path: string): Promise<string> {
  const out = await runVerify({ repo, test, recordBaseline: path });
  const line = out.split("\n").find((l) => l.startsWith("BASELINE RECORDED"));
  if (!line) throw new ReplayEnvError("baseline", `no baseline recorded: ${out.trim().slice(0, 200)}`);
  return line.replace(/^BASELINE RECORDED: \S+ /, "").trim();
}

/** Run the tests and diff them against a recorded baseline. */
export async function verifyAgainst(repo: string, test: string, baseline: string): Promise<VerifyResult> {
  const result = parseVerify(await runVerify({ repo, test, preEditBaseline: baseline }));
  if (!result.line) throw new ReplayEnvError("verify", "no VERDICT line in output");
  return result;
}
