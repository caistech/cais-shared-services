# Kira Testing — Architecture

## Purpose

Kira Testing is a centralised, model-agnostic testing capability shared across the whole
portfolio. Instead of each product repository embedding its own provider keys, model-selection
logic, and OmniRoute wiring, every tester (naive-tester, red-team, and any future tester)
invokes a single shared service through a thin client.

This avoids three repeated failure modes:
1. Provider/model routing logic scattered across tester implementations.
2. Confusing provider/model errors from dynamically resolved models.
3. Duplicated, divergent testing infrastructure per repository.

## Dependency direction

```text
naive-tester ────────┐
                     │
red-team ────────────┤
                     ▼
             kira-testing-client
                     │
                     ▼
             kira-testing service
                     │
                     ▼
                 OmniRoute
                     │
                     ▼
              Kira-testing combo
```

The dependency direction is strictly downward. Testers and the client never reach across to
OmniRoute or to any provider. The service is the single model-resolution boundary.

```text
services/kira-testing/
  src/
    api/
      test.ts       # standard test flow
      redteam.ts    # red-team flow
    gateway/
      omniroute.ts  # the ONLY layer that knows OmniRoute mechanics
    resolver/
      testing-model.ts  # the ONLY layer that decides which model/combo
    schemas/
      test.ts, redteam.ts, result.ts, index.ts   # authoritative contract
    index.ts        # public service surface
```

## Repository usage

A consumer repository does not need to know OmniRoute internals, provider names, provider API
formats, account rotation, model fallback, or the Kira-testing combo. It only needs to know how
to invoke the client:

```ts
import { test, redTeam } from '@caistech/kira-testing-client';

const result = await test({
  repository: 'my-product',
  testId: 'walkthrough-1',
  testType: 'naive-walkthrough',
  target: '/home',
  prompt: 'Walk through this page as a non-technical user…',
});

const red = await redTeam({
  repository: 'my-product',
  testId: 'red-injection-1',
  target: '/api/submit',
  prompt: 'Try to inject…',
  adversarialCategory: 'injection',
});
```

The client validates inputs, invokes the service, and returns the stable provider-independent
result schema.

## Configuration

The Kira-testing model/combo and gateway are configured **once**, in the service, via environment
variables:

| ENV VAR | Purpose |
|---------|---------|
| `KIRA_TESTING_MODEL_COMBO` | The resolved model/combo identifier for OmniRoute (primary) — e.g. `kira-testing` |
| `KIRA_TESTING_MODEL` | Single-model identifier (fallback) |
| `KIRA_TESTING_COMBO` | Alternative combo identifier (fallback) |
| `KIRA_TESTING_OMNIROUTE_BASE_URL` | OmniRoute gateway base URL (default `http://localhost:20128`) |
| `KIRA_TESTING_OMNIROUTE_API_KEY` | Dedicated OmniRoute key for Kira Testing (preferred) |
| `OMNIROUTE_BASE_URL` / `OMNIROUTE_API_KEY` | Shared OmniRoute gateway (fallback base + credential) |

Resolution precedence for the combo:
`KIRA_TESTING_MODEL_COMBO` → `KIRA_TESTING_MODEL` → `KIRA_TESTING_COMBO`.

Gateway credential precedence: `KIRA_TESTING_OMNIROUTE_API_KEY` → `OMNIROUTE_API_KEY`.

There is **no** silent fallback to kira-coding or to an arbitrary model. If no Kira-testing
configuration exists, the service fails explicitly at the resolution stage.

OmniRoute is a self-hosted, OpenAI-compatible AI gateway (`POST <base>/v1/chat/completions`) that
resolves the requested combo to a concrete provider+model with automatic quota-aware auto-fallback
across providers. The gateway maps the `kira-testing` combo to the models configured for it on the
OmniRoute dashboard (free-tier models only, since Kira Testing is a zero-cost validation
capability).

## Authentication

Callers authenticate with the shared service via the existing environment/configuration
mechanism. `KIRA_TESTING_OMNIROUTE_API_KEY` (fallback `OMNIROUTE_API_KEY`) is the shared secret.
No credentials are placed in tester packages or the client.

## Error handling

Failures are classified at distinct layers so they are diagnosable:

| Category | Meaning | Where surfaced |
|----------|---------|----------------|
| `validation` | The request is invalid (missing required fields) | API layer |
| `resolution` | The Kira-testing model/combo could not be resolved | Resolver |
| `gateway` | OmniRoute rejected or could not execute the request | Gateway |
| `model` | The resolved model failed at execution | Gateway classification |
| `normalisation` | The provider response could not be converted | Gateway |

Every result carries a `requestId`, the resolved `modelResolution`, `gateway` info, latency, and
any error details — enough to distinguish a Kira-testing configuration problem from an OmniRoute
problem from an underlying model problem.

## Extension model

A new tester (e.g. an accessibility tester, a performance tester) consumes `kira-testing-client`
and never touches OmniRoute. The new tester contributes only its scenario/strategy logic; the
shared service owns model invocation and resolution. Adding a new tester therefore requires no
change to the gateway, resolver, or client — only the new tester package and its use of the
client.
