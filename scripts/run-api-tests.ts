import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import path from "node:path";

const DEFAULT_AUTH_SECRET = "soundscape-dev-secret-change-me";
const STARTUP_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 300;
const FORCE_KILL_AFTER_MS = 3_000;

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const entries: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const line = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function composeLocalPostgresPorts(root: string): number[] {
  const filePath = path.join(root, "compose.local.yml");
  if (!existsSync(filePath)) return [];
  const text = readFileSync(filePath, "utf8");
  const ports: number[] = [];
  for (const match of text.matchAll(/(\d+):5432\b/g)) {
    const port = Number(match[1]);
    if (Number.isInteger(port) && port > 0 && port <= 65535 && !ports.includes(port)) {
      ports.push(port);
    }
  }
  return ports;
}

function buildDatabaseCandidates(
  root: string,
  explicitDatabaseUrl: string | undefined,
  envFileDatabaseUrl: string | undefined,
): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const push = (url: string | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push(url);
  };

  push(explicitDatabaseUrl);
  push(envFileDatabaseUrl);

  const fallbackPassword = encodeURIComponent(process.env.POSTGRES_PASSWORD || "soundscape");
  const baseUrl =
    explicitDatabaseUrl ?? envFileDatabaseUrl ?? `postgres://soundscape:${fallbackPassword}@127.0.0.1:5432/soundscape`;
  let template: URL | null = null;
  try {
    template = new URL(baseUrl);
  } catch {
    template = null;
  }

  const candidatePorts = [...composeLocalPostgresPorts(root), 5432, 5433];
  for (const port of candidatePorts) {
    if (template) {
      const local = new URL(template.toString());
      local.hostname = "127.0.0.1";
      local.port = String(port);
      push(local.toString());
    } else {
      push(`postgres://soundscape:${fallbackPassword}@127.0.0.1:${port}/soundscape`);
    }
  }

  return candidates;
}

function canConnectTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function resolveDatabaseUrl(
  root: string,
  explicitDatabaseUrl: string | undefined,
  envFileDatabaseUrl: string | undefined,
): Promise<string> {
  const candidates = buildDatabaseCandidates(root, explicitDatabaseUrl, envFileDatabaseUrl);
  const probed: string[] = [];
  for (const url of candidates) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const host = parsed.hostname;
    const port = Number(parsed.port || "5432");
    if (!host || !Number.isInteger(port) || port <= 0) continue;
    probed.push(`${host}:${port}`);
    if (await canConnectTcp(host, port)) return url;
  }
  throw new Error(
    `No reachable PostgreSQL instance found (probed: ${probed.join(", ") || "none"}). Start PostgreSQL or set DATABASE_URL.`,
  );
}

function newestMtime(targetPath: string): number {
  if (!existsSync(targetPath)) return 0;
  const stats = statSync(targetPath);
  if (!stats.isDirectory()) return stats.mtimeMs;
  let newest = stats.mtimeMs;
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    const child = newestMtime(path.join(targetPath, entry.name));
    if (child > newest) newest = child;
  }
  return newest;
}

function needsNextBuild(root: string): boolean {
  const buildIdPath = path.join(root, ".next", "BUILD_ID");
  if (!existsSync(buildIdPath)) return true;
  const buildTime = statSync(buildIdPath).mtimeMs;
  const watchPaths = ["app", "components", "lib", "public", "next.config.ts", "package.json"];
  return watchPaths.some((rel) => newestMtime(path.join(root, rel)) > buildTime);
}

function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

function reserveEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an ephemeral port on 127.0.0.1"));
        return;
      }
      const port = address.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

function appendLogLines(buffer: string[], chunk: Buffer | string) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (!line) continue;
    buffer.push(line);
    if (buffer.length > 80) buffer.shift();
  }
}

async function stopChild(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, FORCE_KILL_AFTER_MS);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function startNextServer(root: string, nextBin: string, env: NodeJS.ProcessEnv) {
  if (needsNextBuild(root)) {
    console.log("Building Next.js app for API tests...");
    const buildCode = await runProcess(process.execPath, [nextBin, "build"], env);
    if (buildCode !== 0) {
      throw new Error(`next build exited with code ${buildCode}`);
    }
  }

  const port = await reserveEphemeralPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs: string[] = [];
  const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env: { ...env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => appendLogLines(logs, chunk));
  child.stderr?.on("data", (chunk) => appendLogLines(logs, chunk));

  let exited = false;
  let exitInfo = "";
  child.once("exit", (code, signal) => {
    exited = true;
    exitInfo = `code=${code ?? "null"} signal=${signal ?? "null"}`;
  });

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`Next.js server exited prematurely (${exitInfo}).\n${logs.join("\n")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/1/validate-token?token=ping`);
      if (response.status > 0) {
        return { baseUrl, child };
      }
    } catch {
      // Wait for Next.js server to listen.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await stopChild(child);
  throw new Error(`Timed out waiting for Next.js server at ${baseUrl}.\n${logs.join("\n")}`);
}

async function main() {
  const root = process.cwd();
  const explicitDatabaseUrl = process.env.DATABASE_URL;
  const envFile = parseEnvFile(path.join(root, ".env"));
  for (const [key, value] of Object.entries(envFile)) {
    if (key !== "DATABASE_URL" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = DEFAULT_AUTH_SECRET;
  }
  if (!process.env.NEXT_TELEMETRY_DISABLED) {
    process.env.NEXT_TELEMETRY_DISABLED = "1";
  }

  const databaseUrl = await resolveDatabaseUrl(root, explicitDatabaseUrl, envFile.DATABASE_URL);
  process.env.DATABASE_URL = databaseUrl;

  const [{ migrate }, { createPostgres }] = await Promise.all([import("../lib/migrations"), import("../lib/postgres")]);
  const sql = createPostgres();
  try {
    await migrate(sql);
  } finally {
    await sql.end();
  }

  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl };
  let serverChild: ChildProcess | null = null;
  let stopping = false;

  const cleanup = async () => {
    if (stopping) return;
    stopping = true;
    await stopChild(serverChild);
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    void cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    if (!env.BASE_URL) {
      const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
      const started = await startNextServer(root, nextBin, env);
      serverChild = started.child;
      env.BASE_URL = started.baseUrl;
    }

    const userArgs = process.argv.slice(2);
    const hasExplicitTarget = userArgs.some((arg) => !arg.startsWith("-"));
    const testFiles = hasExplicitTarget
      ? []
      : readdirSync(path.join(root, "tests", "api"))
          .filter((name) => name.endsWith(".test.ts"))
          .sort()
          .map((name) => path.join("tests", "api", name));

    const code = await runProcess(
      process.execPath,
      ["--import", "tsx", "--test", "--test-reporter=spec", ...userArgs, ...testFiles],
      env,
    );
    await cleanup();
    process.exit(code);
  } finally {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
