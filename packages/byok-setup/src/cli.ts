#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadManifest, validateValue, isRequired, exclusiveGroupViolations } from "./validate.js";
import { generateSecret } from "./secrets.js";
import { writeEnvFile, assertGitignored } from "./adapters/env-file.js";
import { vercelPush } from "./adapters/vercel.js";
import type { ByokService, Phase } from "./schema.js";

interface Args {
  apply: boolean;
  force: boolean;
  manifest: string;
  phase: string; // "pre-deploy" (build+runtime) | "post-deploy" | "all"
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const a = argv.find((x) => x.startsWith(flag + "="));
    return a ? a.slice(flag.length + 1) : undefined;
  };
  return {
    apply: argv.includes("--apply"),
    force: argv.includes("--force"),
    manifest: get("--manifest") ?? "byok.config.json",
    phase: get("--phase") ?? "pre-deploy",
  };
}

const PRE_DEPLOY: ReadonlySet<Phase> = new Set<Phase>(["build", "runtime"]);

function inPhase(s: ByokService, phase: string): boolean {
  const p: Phase = s.dependsOnDeploy ? "post-deploy" : s.phase ?? "runtime";
  if (phase === "all") return true;
  if (phase === "post-deploy") return p === "post-deploy";
  return PRE_DEPLOY.has(p);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(process.cwd(), args.manifest);
  if (!existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }
  const manifest = loadManifest(readFileSync(manifestPath, "utf8"));

  console.log(`\nBYOK setup — ${manifest.product}${manifest.version ? " v" + manifest.version : ""}`);
  console.log(args.apply ? "(apply mode — values will be written/pushed)" : "(dry-run — nothing written; re-run with --apply)");
  console.log(`phase: ${args.phase}\n`);

  const services = manifest.services.filter((s) => inPhase(s, args.phase));

  // Group by provider, first-seen order, so the operator sets up each account once.
  const order: string[] = [];
  const groups = new Map<string, ByokService[]>();
  for (const s of services) {
    const prov = s.provider ?? "other";
    if (!groups.has(prov)) {
      groups.set(prov, []);
      order.push(prov);
    }
    groups.get(prov)!.push(s);
  }

  const collected: Record<string, string> = {};
  const externalMatch: ByokService[] = [];
  const rl = readline.createInterface({ input, output });

  try {
    for (const prov of order) {
      console.log(`\n===== ${prov} =====`);
      for (const s of groups.get(prov)!) {
        if (s.autoGenerate) {
          collected[s.envVar] = generateSecret(s.autoGenerate);
          if (s.secretClass === "external-match") externalMatch.push(s);
          console.log(`  ${s.envVar}: auto-generated${s.secretClass === "external-match" ? " (MUST also paste into the external sender — see summary)" : ""}`);
          continue;
        }
        const req = isRequired(s, collected);
        console.log(`  ${s.name} [${s.envVar}]${req ? " (required)" : " (optional)"}${s.dependsOnDeploy ? " — POST-DEPLOY" : ""}`);
        if (s.description) console.log(`    ${s.description}`);
        if (s.keyPage) console.log(`    get it: ${s.keyPage}`);
        for (const i of s.instructions ?? []) console.log(`      - ${i}`);
        for (;;) {
          const ans = (await rl.question(`    paste ${s.envVar} (blank to skip): `)).trim();
          if (!ans) {
            if (req) console.log("    (required — leave it now, fill in .env.local before deploy)");
            break;
          }
          const v = validateValue(s, ans);
          if (!v.ok) {
            console.log(`    x ${v.reason}. Try again, or blank to skip.`);
            continue;
          }
          collected[s.envVar] = ans;
          break;
        }
      }
    }
  } finally {
    rl.close();
  }

  // Validation summary (phase-aware).
  const missing = services
    .filter((s) => !s.exclusiveGroup && isRequired(s, collected) && !collected[s.envVar])
    .map((s) => s.envVar);
  const groupViol = exclusiveGroupViolations(manifest, collected);
  if (missing.length) console.log(`\n! Missing required (fill before deploy): ${missing.join(", ")}`);
  if (groupViol.length) console.log(`! Unsatisfied either/or groups: ${groupViol.join("; ")}`);
  if (externalMatch.length) {
    console.log("\n! Generated secrets you MUST also configure in the external sender (else it 401s silently):");
    for (const s of externalMatch) console.log(`    ${s.envVar} -> ${s.description ?? "paste the same value into the sender"}`);
  }

  if (Object.keys(collected).length === 0) {
    console.log("\nNothing collected. Done.");
    return;
  }

  const destinations = manifest.destinations ?? { "env-file": { path: ".env.local" } };

  if (destinations["env-file"]) {
    const envPath = resolve(process.cwd(), destinations["env-file"].path ?? ".env.local");
    if (args.apply) {
      assertGitignored(envPath, resolve(process.cwd(), ".gitignore"));
      const r = writeEnvFile(envPath, collected, { force: args.force });
      console.log(`\nenv-file: wrote ${r.written.length} [${r.written.join(", ") || "none"}]${r.kept.length ? `; kept existing ${r.kept.length} (use --force to overwrite)` : ""}`);
    } else {
      console.log(`\nenv-file (dry-run): would write ${Object.keys(collected).length} keys to ${envPath}`);
    }
  }

  if (destinations["vercel"]) {
    const targets = destinations["vercel"].targets ?? ["production", "preview", "development"];
    const entries = Object.entries(collected);
    if (args.apply) {
      console.log(`\nvercel: pushing ${entries.length} keys x ${targets.length} targets...`);
      for (const [k, v] of entries) {
        for (const t of targets) {
          const r = await vercelPush(k, v, t);
          console.log(`  ${k} -> ${t}: ${r.status}${r.error ? " (" + r.error + ")" : ""}`);
        }
      }
    } else {
      console.log(`vercel (dry-run): would push ${entries.length} keys x ${targets.length} targets (${targets.join(", ")})`);
    }
  }

  console.log(
    args.apply
      ? "\nDone. If you wrote a real .env.local, delete it after pushing (plaintext secrets)."
      : "\nDry-run complete. Re-run with --apply to write/push."
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
