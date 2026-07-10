# Promise-Attribute Bars — PROPOSAL for review

**Summary:** 3 products GENERATED with full draft bars (f2k-projects, lessonslearned, storefront-mcp — the last carries an infra-vs-product flag). The 5 previously-parked NEEDS_PROMISE_DEFINITION products (universal-interviews, leadspark, aiftis, mova, storyverse) were DROPPED by the operator 2026-07-10 (see the DROPPED section).
All bars are `approved: false` drafts. Canonical `promise-attributes.json` untouched. Source JSON: `promise-attributes-PROPOSAL.json`.

---

## GENERATED

### F2K Projects (`f2k-projects`)

**Promise:** Browse a land estate like a premium product, pick your lot, and walk away with a configured, priced proposal in the same session.
**Distributor:** Land-estate developers & project marketers.

| Attribute | Quality bar |
|---|---|
| Premium lot browse | every lot on an interactive estate plan opens to its own detail card (size, frontage, orientation, price, live status) in one click - not a static masterplan PDF or an undifferentiated table of lot numbers |
| 'I want THAT lot' moment | a specific lot feels ownable - the detail view shows what living/building THERE looks like (aspect, dimensions on the plan, what fits on it) so a viewer names a favourite lot unprompted - not interchangeable rectangles with prices |
| Hot-configured proposal | registering interest on a lot produces a branded proposal specific to THAT lot with real configured numbers (lot price + selected package/options) inside the session or within minutes - not a 'thanks, we'll be in touch' acknowledgement |
| Live estate truth | lot availability (available/held/sold) is current and consistent everywhere it appears, and a just-registered interest visibly changes state - not stale statuses that make the estate feel abandoned |
| Distributor pull (qualified leads) | the developer's admin view shows leads arriving already qualified - lot chosen, configuration captured, proposal sent - under the ESTATE's brand end-to-end - not raw name+email enquiries they must re-qualify by phone |

**Rationale:** Inferred the promise as the DEMAND side of the F2K pipeline: premium browsable estate + browser-to-configured-lead conversion. Key assumption: the configurator/proposal flow (folded in from F2K-Contracts) is in the thin slice — if it isn't yet, the 'hot-configured proposal' bar is the one to check. Delivery-side (Checkpoint's job) deliberately excluded.

### Lessons Learned (`lessonslearned`)

**Promise:** Speak a hard-won lesson in seconds and have exactly the right past lesson resurface when you next need it.
**Distributor:** Consultancies, trade businesses & field-service teams that accumulate field knowledge.

| Attribute | Quality bar |
|---|---|
| Frictionless voice capture | tap, speak naturally, done - a usable distilled lesson exists within ~15 seconds of finishing speaking, with zero typing or transcript cleanup required - not a recording the user must title, tag, and edit |
| Distillation quality | the stored item is a crisp situation-plus-lesson the speaker recognises as 'yes, that's what I meant' - context preserved, rambling removed - not a raw transcript dump or an over-summarised platitude that lost the specifics |
| Semantic recall | asking in COMPLETELY different words than the original capture (zero keyword overlap) surfaces the right prior lesson as the top result - not keyword search that only finds exact phrasings |
| Unprompted resurfacing | while capturing or working on a NEW situation, a genuinely related prior lesson surfaces on its own ('you hit something like this in March...') - not a library the user must remember to search |
| Distributor pull (team brain) | a team lead sees the team's collective lesson base compound across members - one member's field lesson recallable by another, with attribution - not per-person silos or a usage counter |

**Rationale:** Inferred the promise as capture-friction-zero plus genuine semantic resurfacing. Key judgment call: 'unprompted resurfacing' is its own attribute distinct from search-based recall, because that's what separates this from a voice-memo app — drop it if search-only is deemed sufficient for Gate 1. Team-brain bar is demoable with hardcoded users (no multi-tenant needed).

### Storefront MCP (`storefront-mcp`)

**Promise:** Your product becomes a tool an AI agent can find and operate - watch an agent discover your storefront and complete a real transaction inside its own chat.
**Distributor:** Product operators & dev shops who want their app usable inside other agents.

| Attribute | Quality bar |
|---|---|
| Agent discovers you | a fresh, unprimed agent (Claude/ChatGPT with the MCP endpoint added) lists the product's tools with descriptions accurate enough that it chooses the right tool for a natural-language ask - not a manifest that parses but describes tools so vaguely the agent guesses wrong |
| Agent operates you end-to-end | an agent completes a real multi-step transaction purely via tools - browse/search the catalog, inspect an item, place the order or enquiry - and the result lands in the real storefront - not read-only listing or a stubbed 'order received' that goes nowhere |
| Minutes-not-a-project install | an operator points the kit at their existing product/config and has live, agent-callable tools the same sitting - not a bespoke integration engagement per storefront |
| Distributor pull (new channel proof) | the operator sees a real order/lead arrive attributed to the AGENT channel - 'this sale came from someone's assistant, not my website' - not a hypothetical slide about agent traffic |

**Rationale:** Framed around the watchable moment — an agent in a chat window driving the store — the only way this demos as a product rather than a protocol. **INFRA RISK to rule on:** it's being promoted to `@caistech/webmcp-kit`, i.e. it may really be substrate (never lane-assigned, never Gate-1-scored) with storefront-mcp as its first consumer; if so, these bars belong to a demo consumer product, not the kit.


---

## DROPPED (2026-07-10, operator)

universal-interviews, leadspark, aiftis, mova, and storyverse were **dropped** — no Gate-1 promise bars will be drafted or offered for them. Removed from the proposal. If any is revived, the operator defines its promise first.
