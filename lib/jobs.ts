import { recordError } from "./errors";
import { getValue, setValue } from "./kv";

const FIRST_RUN_DELAY_MS = 60 * 1000;

export type JobResult = { checked?: number; found?: number; unreachable?: boolean; reason?: string };
export type JobRun = JobResult & { at: number; ms: number; error?: string };

const key = (name: string) => `job:${name}`;

export async function runJob(name: string, work: () => Promise<JobResult | undefined>) {
  const at = Date.now();
  try {
    const result = (await work()) ?? {};
    await setValue(key(name), { ...result, at, ms: Date.now() - at } satisfies JobRun);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setValue(key(name), { at, ms: Date.now() - at, error: message } satisfies JobRun).catch(() => {});
    console.warn(`${name}: ${message}`);
    await recordError(`job ${name}`, error);
  }
}

export async function lastRun(name: string) {
  return getValue<JobRun>(key(name));
}

const globalForJobs = globalThis as unknown as { soundscapeJobs?: Set<string> };

export function every(name: string, intervalMs: number, work: () => Promise<JobResult | undefined>) {
  globalForJobs.soundscapeJobs ??= new Set();
  if (globalForJobs.soundscapeJobs.has(name)) return;
  globalForJobs.soundscapeJobs.add(name);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runJob(name, work);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, Math.min(FIRST_RUN_DELAY_MS, intervalMs));
  setInterval(tick, intervalMs);
}
