import type { Span } from "@opentelemetry/api";

type Kind = "WORKFLOW" | "AGENT" | "CHAIN" | "TOOL" | "GUARDRAIL";
type Neatlogs = typeof import("neatlogs");

let nl: Neatlogs | undefined;

/** Start tracing. Without NEATLOGS_API_KEY the audit still runs, it just is not exported. */
export async function initTracing(): Promise<void> {
  // The SDK logs at INFO to stdout and reads its level once, at import. Keep stdout for --json.
  process.env.NEATLOGS_LOG_LEVEL ??= "WARN";
  nl = await import("neatlogs");
  const exporting = Boolean(process.env.NEATLOGS_API_KEY);
  await nl.init({
    workflowName: "revenant",
    disableExport: !exporting,
    registerShutdownHandlers: false,
  });
  if (!exporting) console.error("neatlogs: NEATLOGS_API_KEY not set, spans are not exported");
}

/** The loaded SDK, for wrapping model clients so every call becomes an LLM span. */
export function neatlogs(): Neatlogs {
  if (!nl) throw new Error("initTracing() must run first");
  return nl;
}

export async function shutdownTracing(): Promise<void> {
  await nl?.shutdown();
}

/**
 * One named step of an audit. Every span carries `revenant.*` attributes so a trace
 * can be found by commit or checkpoint. The callback can add more as it learns them.
 * The same ids also go in as the span input, because the neatlogs public read API
 * returns input and output previews but not attributes.
 */
export function step<T>(
  name: string,
  kind: Kind,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  if (!nl) throw new Error("initTracing() must run before any step");
  return nl.trace({ name, kind, attributes, input: attributes }, fn);
}
