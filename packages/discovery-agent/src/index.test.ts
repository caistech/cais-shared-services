import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  buildDiscoverySystemPrompt,
  resolveDiscoverySession,
  defineDiscovery,
  type DiscoveryConfig,
  type StructuredRunner,
} from "./index.js";
import { mintAnonSessionToken } from "@caistech/elevenlabs-convai";

const schema = z.object({ topic: z.string(), painSeverity: z.number() });
type Outcome = z.infer<typeof schema>;

function makeConfig(overrides: Partial<DiscoveryConfig<Outcome>> = {}): DiscoveryConfig<Outcome> {
  return {
    slug: "kindred",
    purpose: "Learn what the writer is stuck on",
    persona: {
      name: "Kindred",
      voiceId: "voice_123",
      opening: "Hi, I'm Kindred — what are you working on?",
      signature: "Talk soon.",
      systemPrompt: "You are Kindred, a warm co-writer.",
    },
    stages: [
      { id: "warmup", goal: "Build rapport", context: "First contact.", mustCover: ["their name"] },
      { id: "problem", goal: "Find the blocker", context: "Dig into the stuck point." },
    ],
    extraction: {
      schema,
      system: "Distil the transcript to the schema.",
      model: { provider: "anthropic", model: "claude-fable-5" },
    },
    onResult: async () => {},
    ...overrides,
  };
}

describe("buildDiscoverySystemPrompt", () => {
  it("embeds persona, purpose, the numbered stage arc and mustCover", () => {
    const prompt = buildDiscoverySystemPrompt(makeConfig());
    expect(prompt).toContain("You are Kindred");
    expect(prompt).toContain("Learn what the writer is stuck on");
    expect(prompt).toContain("1. [warmup] Build rapport");
    expect(prompt).toContain("Must cover: their name.");
    expect(prompt).toContain("2. [problem] Find the blocker");
    expect(prompt).toContain('Sign off with: "Talk soon."');
  });

  it("omits the sign-off line when no signature is set", () => {
    const cfg = makeConfig();
    cfg.persona.signature = undefined;
    expect(buildDiscoverySystemPrompt(cfg)).not.toContain("Sign off with");
  });
});

describe("resolveDiscoverySession", () => {
  const secret = "test-secret";
  const token = mintAnonSessionToken(secret, { agentId: "agent_1", sid: "subject_42" }).token;
  const req = new Request("https://app.example.com/api/convai/webhooks/start-conversation");

  it("recovers the subject id from a signed token carried as user_id", () => {
    const ctx = resolveDiscoverySession(req, { user_id: token }, secret);
    expect(ctx).toEqual({ userId: "subject_42", anonSessionId: "subject_42" });
  });

  it("returns null for a missing token", () => {
    expect(resolveDiscoverySession(req, {}, secret)).toBeNull();
  });

  it("returns null for a token signed with a different secret (unforgeable)", () => {
    expect(resolveDiscoverySession(req, { user_id: token }, "wrong-secret")).toBeNull();
  });

  it("reads a bearer token from the authorization header", () => {
    const authed = new Request("https://app.example.com/x", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resolveDiscoverySession(authed, {}, secret)?.userId).toBe("subject_42");
  });
});

describe("defineDiscovery.distil", () => {
  it("runs the injected runner and validates the result against the schema", async () => {
    const seen: { model: string; input: string }[] = [];
    const runner: StructuredRunner = {
      async run({ model, input }) {
        seen.push({ model: model.model, input });
        return { result: { topic: "plot", painSeverity: 8 } };
      },
    };
    const disc = defineDiscovery(makeConfig({ extraction: { ...makeConfig().extraction, requireEvidence: true } }), {
      runner,
      elevenLabsApiKey: "x",
      sessionSecret: "s",
      supabase: {} as never,
      baseUrl: "https://app.example.com",
    });
    const out = await disc.distil({ conversationId: "c1", subjectId: "subject_42", transcript: "User: I'm stuck." });
    expect(out).toEqual({ topic: "plot", painSeverity: 8 });
    expect(seen[0].model).toBe("claude-fable-5"); // frontier tier used for extraction
    expect(seen[0].input).toContain("attach the transcript quote"); // requireEvidence applied
  });

  it("rejects a runner result that violates the schema", async () => {
    const runner: StructuredRunner = {
      async run() {
        return { result: { topic: "plot", painSeverity: "high" } as never };
      },
    };
    const disc = defineDiscovery(makeConfig(), {
      runner,
      elevenLabsApiKey: "x",
      sessionSecret: "s",
      supabase: {} as never,
      baseUrl: "https://app.example.com",
    });
    await expect(
      disc.distil({ conversationId: "c1", subjectId: "s", transcript: "t" })
    ).rejects.toThrow();
  });

  it("startSession throws until an agent has been provisioned", async () => {
    const runner: StructuredRunner = { async run() { return { result: {} as never }; } };
    const disc = defineDiscovery(makeConfig(), {
      runner,
      elevenLabsApiKey: "x",
      sessionSecret: "s",
      supabase: {} as never,
      baseUrl: "https://app.example.com",
    });
    await expect(disc.startSession("subject_42")).rejects.toThrow(/existingAgentId/);
  });
});
