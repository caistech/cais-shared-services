import { spawn } from "node:child_process";

export type Spawner = typeof spawn;
export type PushStatus = "ok" | "exists" | "failed";

export interface VercelPushResult {
  key: string;
  target: string;
  status: PushStatus;
  error?: string;
}

/**
 * Push one env var to one Vercel target. The value goes via STDIN, never argv,
 * so secrets don't leak to the process list or CI logs. The spawner is injectable
 * so tests never shell out to real `vercel`.
 */
export async function vercelPush(
  key: string,
  value: string,
  target: string,
  opts: { spawner?: Spawner } = {}
): Promise<VercelPushResult> {
  const spawner = opts.spawner ?? spawn;
  return new Promise((resolve) => {
    const p = spawner("vercel", ["env", "add", key, target], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });
    let out = "";
    let err = "";
    p.stdout?.on("data", (d) => {
      out += d.toString();
    });
    p.stderr?.on("data", (d) => {
      err += d.toString();
    });
    p.on("close", (code) => {
      if (code === 0) {
        resolve({ key, target, status: "ok" });
      } else if (/already exists/i.test(err) || /already exists/i.test(out)) {
        resolve({ key, target, status: "exists" });
      } else {
        resolve({ key, target, status: "failed", error: err.split("\n").slice(0, 3).join(" | ") });
      }
    });
    p.stdin?.write(value + "\n");
    p.stdin?.end();
  });
}
