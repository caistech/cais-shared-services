import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { vercelPush, type Spawner } from "./vercel.js";

/** Fake spawner that records argv + what was written to stdin, then emits a close. */
function makeSpawner(code: number, stderr = "") {
  const seen = { args: [] as string[], stdin: "" };
  const spawner = ((_cmd: string, args: string[]) => {
    seen.args = args;
    const proc = new EventEmitter() as EventEmitter & {
      stdin: { write: (s: string) => void; end: () => void };
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    proc.stdin = { write: (s: string) => { seen.stdin += s; }, end: () => {} };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    queueMicrotask(() => {
      if (stderr) proc.stderr.emit("data", Buffer.from(stderr));
      proc.emit("close", code);
    });
    return proc;
  }) as unknown as Spawner;
  return { spawner, seen };
}

describe("vercelPush", () => {
  it("returns ok on exit 0", async () => {
    const { spawner } = makeSpawner(0);
    const r = await vercelPush("RESEND_API_KEY", "re_test", "production", { spawner });
    expect(r.status).toBe("ok");
  });

  it("sends the secret via stdin and NEVER in argv (the P1 property)", async () => {
    const { spawner, seen } = makeSpawner(0);
    await vercelPush("RESEND_API_KEY", "re_supersecret", "production", { spawner });
    expect(seen.stdin).toBe("re_supersecret\n");
    expect(seen.args).toEqual(["env", "add", "RESEND_API_KEY", "production"]);
    expect(seen.args).not.toContain("re_supersecret");
  });

  it("maps 'already exists' to exists", async () => {
    const { spawner } = makeSpawner(1, "Error: Environment Variable already exists");
    const r = await vercelPush("K", "v", "preview", { spawner });
    expect(r.status).toBe("exists");
  });

  it("maps other non-zero exits to failed with an error", async () => {
    const { spawner } = makeSpawner(1, "Error: not authenticated");
    const r = await vercelPush("K", "v", "development", { spawner });
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/not authenticated/);
  });
});
