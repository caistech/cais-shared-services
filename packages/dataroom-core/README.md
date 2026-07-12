# @caistech/dataroom-core

Tier-gated **RAG-over-documents** engine, extracted from the LingoPure investor dataroom.

**ingest → embed → tier-filtered retrieve → cited answer / multi-section report → branded, watermarked PDF.**

App-agnostic per the `@caistech` rule: the **LLM (`chat`) and the DB (`retrieve`) are injected**, so
the package never touches a database, never pins a model SDK, and the **tier filter stays inside the
consumer's `SECURITY DEFINER` RPC**. Prompts, the report catalogue, brand, and persistence belong to
the consumer; the RAG orchestration + PDF renderers + tier-lattice are the engine.

> **v0.1.0 scope:** the runtime engine (`retrieve` / `answer` / `report` / `pdf` / `tier`). The
> Node-only ingestion pipeline (extract→chunk→embed→persist) is a planned `/ingest` subpath.

## Install

```bash
npm install @caistech/dataroom-core
```

## Wiring (the consumer owns the DB + LLM)

```ts
import { createDataroom, makeTierPolicy, makeDefaultTitleFor, makeReportSpecSchema } from "@caistech/dataroom-core";

// 1. Your tier lattice (server-derived max tier → searchable tiers).
const policy = makeTierPolicy(["main", "restricted"] as const,
  (max) => (max === "restricted" ? ["main", "restricted"] : ["main"]));

// 2. Inject your retriever — embeds the query + calls YOUR tier-filtered RPC.
const retrieve = async (query, allowedTiers, matchCount) => {
  const embedding = await embedQuery(query);              // your OpenAI/Voyage call
  const { data } = await svc.rpc("match_dataroom_chunks", {  // your SECURITY DEFINER RPC
    query_embedding: embedding, allowed_tiers: allowedTiers, match_count: matchCount,
  });
  return (data ?? []).map(mapRowToRetrievedChunk);        // → RetrievedChunk[]
};

// 3. Inject your LLM.
const chat = async ({ system, user, model, maxTokens }) => {
  const r = await anthropic.messages.create({ model: model ?? "claude-sonnet-4-6", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  const block = r.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
};

// 4. Bind once, then call with SERVER-DERIVED tiers.
const dataroom = createDataroom({
  chat, retrieve,
  answer: { systemPrompt: MY_ANALYST_PROMPT, noAnswerText: "…" },
  report: { sectionSystemPrompt: MY_SECTION_PROMPT, notCoveredText: "Not covered in the available dataroom.", titleFor: makeDefaultTitleFor(MY_CAPABILITIES, "Acme —") },
});

const { answer, citations } = await dataroom.answerQuestion(question, policy.allowedTiersFor(investor.maxTier));
const report = await dataroom.buildReport(spec, policy.allowedTiersFor(investor.maxTier));
```

## The retriever RPC contract (template — you install it in your own DB)

The package never runs SQL. Your `retrieve` must call a **`SECURITY DEFINER`** RPC that applies the
tier filter *inside* the database (so passing tiers can only ever narrow, never widen, access), over
a `pgvector` chunks table. Reference shape:

```sql
-- chunks: (chunk_id, document_id, display_name, page, content, is_vision_caption,
--          confidentiality_tier text, embedding vector(1536))  -- RLS on, no anon policy
create or replace function match_dataroom_chunks(
  query_embedding vector(1536), allowed_tiers text[], match_count int
) returns table (chunk_id uuid, document_id uuid, display_name text, page int,
                 content text, is_vision_caption bool, confidentiality_tier text, similarity float)
language sql security definer set search_path = public as $$
  select c.id, c.document_id, d.display_name, c.page, c.content, c.is_vision_caption,
         c.confidentiality_tier, 1 - (c.embedding <=> query_embedding) as similarity
  from dataroom_chunks c join dataroom_documents d on d.id = c.document_id
  where c.confidentiality_tier = any(allowed_tiers)
  order by c.embedding <=> query_embedding limit match_count;
$$;
-- revoke execute from anon, authenticated;  -- service-role only
```

`EXECUTE` should be granted to the service role only; your route resolves `allowed_tiers` from the
caller's **server-side** max tier before calling. Auth, the `investors`/NDA/audit/reports tables,
Storage, and the concrete tier values stay in your app.

## Surface

- `createDataroom(deps)` → `{ answerQuestion, buildReport }` — the bound engine.
- `answerQuestion`, `buildReport` — the standalone functions (deps passed per call).
- `buildContext`, `citationsFromChunks` — pure retrieval-formatting helpers.
- `makeTierPolicy` — the tier lattice.
- `makeReportSpecSchema`, `capabilityFor`, `makeDefaultTitleFor`, `capabilityManifestForLLM` — the report contract (catalogue injected).
- `renderReportPdf`, `stampPdf` — branded/watermarked PDF (markdown→PDF and stamp-an-existing-PDF); brand injectable, defaults to navy/gold.

First consumer: **LingoPureAI** (investor dataroom).
