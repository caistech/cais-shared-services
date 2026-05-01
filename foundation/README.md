# Foundation Context Layer

GTM/content substrate for Corporate AI Solutions products. Single source of truth for **audience**, **creator voice**, **market positioning**, and **customer journey**.

Lives in the shared-services hub — not per-project — to avoid duplicating the same brand/audience/positioning content across 38+ products.

## Structure

```
foundation/
├── _portfolio/              # Corporate AI Solutions brand layer
│   ├── creator-style.md     # Dennis's voice, factory narrative
│   └── market-positioning.md # "The Unicorn Is the Factory"
└── products/
    ├── <product-slug>/      # Product-specific overrides
    │   ├── audience-delight.md
    │   ├── creator-style.md      # (optional override)
    │   ├── customer-journey.md
    │   └── market-positioning.md # (optional override)
    └── ...
```

## Four file types

| File | Purpose |
|------|---------|
| `audience-delight.md` | Who they are, what lights them up, vocabulary, where they hang out |
| `creator-style.md` | Sentence patterns, rhythm, words we use/avoid, voice calibration |
| `market-positioning.md` | Territory owned/contested/ceded, competitor claims, white space |
| `customer-journey.md` | How they find us, evaluation questions, stalls, conversion/churn triggers |

## Loading protocol

Each file starts with a header block:

```markdown
---
Load this file when the skill: <conditions>
Do NOT load this file when the skill: <exclusions>
---
```

Consumer skills scan `foundation/` headers only, load full files only on match. See the `/load-foundation` gstack skill (once built) for the canonical implementation.

## Override rule

Product overrides **replace** (not merge) the portfolio default for that file. If `products/mmcbuild/market-positioning.md` exists, `_portfolio/market-positioning.md` is NOT loaded for MMCBuild work.

Reason: MMCBuild is a paying client with a distinct brand — must not inherit the "factory" narrative. Same rule for any white-label or client-owned product.

## What goes here vs. MEMORY.md

| Foundation | Memory |
|------------|--------|
| Content substrate (voice, positioning, audience) | Behavioral rules, project status, user preferences |
| Loaded on demand by content-producing skills | Always loaded, guides how Claude works |
| Changes when market/voice shifts | Changes every session |

If you find yourself writing audience vocabulary or positioning claims into a memory file, it belongs here instead. If you find yourself writing a "don't do X" rule into foundation, it belongs in memory.

## Consumption (future state)

Planned as `@caistech/foundation-context` package. For now, consume via direct hub path:

```
C:\Users\denni\PycharmProjects\cais-shared-services\foundation\
```

## Updating

- Update when market shifts, winning content surfaces new patterns, or a product ships a distinct brand
- Timestamp updates at bottom of each file (`_Last updated: YYYY-MM-DD_`)
- Dedupe against MEMORY.md before adding — don't parallel-track
