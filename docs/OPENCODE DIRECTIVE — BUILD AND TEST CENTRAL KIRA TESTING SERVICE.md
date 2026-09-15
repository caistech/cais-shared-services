# OPENCODE DIRECTIVE — BUILD AND TEST CENTRAL KIRA TESTING SERVICE

## Mission

Implement the centralised **Kira Testing Service** in `cais-shared-services` so that `naive-tester` and `red-team` can invoke Kira Testing from **any repository** through a stable shared client/CLI interface.

The target architecture is:

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

The purpose of this task is to create the actual files, implement them, integrate them with the existing `cais-shared-services` architecture, and test the complete path.

Do not stop at documentation or scaffolding.

---

# 1. AUTHORITATIVE ARCHITECTURAL RULES

The following rules are mandatory.

### RULE 1 — Kira Testing is centralised

`kira-testing` belongs in:

```text
cais-shared-services/
```

It must not be duplicated independently inside every application repository.

### RULE 2 — Testers do not call OmniRoute directly

Neither:

```text
naive-tester
```

nor:

```text
red-team
```

may contain provider/model-routing logic.

They invoke:

```text
kira-testing-client
```

only.

### RULE 3 — Client does not contain provider routing logic

The client is an invocation/API abstraction.

It must not decide:

- which underlying model to use;
- which OmniRoute account to use;
- which provider is selected;
- which fallback is selected.

That belongs to:

```text
services/kira-testing/
```

and specifically the resolver/gateway layers.

### RULE 4 — OmniRoute is the gateway

Kira Testing must invoke the configured Kira-testing model/combo through OmniRoute.

Do not hard-code Anthropic, OpenAI, Gemini, Kimi, etc. into the tester implementation.

The testing model must be resolved through the Kira-testing routing configuration.

### RULE 5 — Kira Testing is distinct from Kira Coding

Do not reuse the Kira Coding combo merely because it already exists.

Kira Testing must have its own logical model/combo configuration.

The implementation must therefore refer to the logical concept:

```text
kira-testing
```

rather than embedding a provider/model identity throughout the codebase.

### RULE 6 — Repository independence

A repository using Kira Testing should only need to know how to invoke:

```text
kira-testing-client
```

It should not need to know:

- OmniRoute internals;
- provider names;
- provider API formats;
- account rotation;
- model fallback;
- Kira-testing combo internals.

### RULE 7 — Fail explicitly

Do not silently fall back to an unrelated model if the Kira-testing model cannot be resolved.

A failure must clearly identify:

- logical service;
- resolution stage;
- gateway stage;
- underlying error;
- correlation/request ID where available.

This is particularly important because previous testing attempts have produced confusing provider/model errors.

---

# 2. FIRST: INSPECT THE EXISTING REPOSITORY

Before writing code, inspect:

```text
cais-shared-services/
```

and determine:

1. existing package manager;
2. existing TypeScript configuration;
3. existing workspace/monorepo configuration;
4. existing package naming conventions;
5. existing service conventions;
6. existing API/service patterns;
7. existing CLI patterns;
8. existing OmniRoute integration;
9. existing environment/configuration conventions;
10. existing test framework;
11. existing build/lint/typecheck commands;
12. existing Kira Coding integration, if present;
13. existing Kira Testing implementation elsewhere, if present.

Do not create a competing architecture when an existing shared-services convention already exists.

Reuse existing infrastructure where appropriate.

However, do not allow existing conventions to violate the architecture defined in this directive.

---

# 3. CREATE THIS STRUCTURE

Create the following structure under `cais-shared-services`:

```text
cais-shared-services/
│
├── services/
│   └── kira-testing/
│       ├── src/
│       │   ├── api/
│       │   │   ├── test.ts
│       │   │   └── redteam.ts
│       │   │
│       │   ├── gateway/
│       │   │   └── omniroute.ts
│       │   │
│       │   ├── resolver/
│       │   │   └── testing-model.ts
│       │   │
│       │   ├── schemas/
│       │   │   ├── test.ts
│       │   │   ├── redteam.ts
│       │   │   └── result.ts
│       │   │
│       │   └── index.ts
│       │
│       └── README.md
│
├── packages/
│   ├── kira-testing-client/
│   │   └── src/
│   │       └── index.ts
│   │
│   └── kira-testing-cli/
│       └── src/
│           └── index.ts
│
├── testers/
│   ├── naive-tester/
│   └── red-team/
│
├── schemas/
│   └── testing/
│
└── docs/
    └── KIRA-Testing-Architecture.md
```

If existing repository conventions require additional standard files such as:

```text
package.json
tsconfig.json
vitest.config.ts
README.md
index.ts
```

create them where required.

Do not create unnecessary duplicate infrastructure.

---

# 4. DEFINE THE SERVICE BOUNDARY

The central service must expose two logical operations.

## 4.1 Standard test

Conceptually:

```text
kiraTesting.test(...)
```

This is used by:

```text
naive-tester
```

and any future ordinary automated testing system.

## 4.2 Red-team test

Conceptually:

```text
kiraTesting.redTeam(...)
```

This is used by:

```text
red-team
```

The two operations may share internal infrastructure, but their request schemas and semantic purpose must remain distinguishable.

---

# 5. DEFINE REQUEST SCHEMAS

Create strongly typed schemas for testing requests.

At minimum, support the following conceptual fields where appropriate:

```text
requestId
repository
testId
testType
target
prompt/input
context
expectedBehaviour
metadata
```

Do not invent fields that are unnecessary merely to make the schema large.

The schema must allow the testing service to understand:

- what is being tested;
- where it came from;
- what input is being supplied;
- what behaviour is expected;
- whether this is ordinary or adversarial testing.

Red-team requests must additionally be capable of expressing adversarial intent/test metadata without coupling the schema to a particular LLM provider.

---

# 6. DEFINE RESULT SCHEMA

Create a stable result contract.

At minimum the result should distinguish:

```text
success
failure
error
inconclusive
```

and provide enough metadata to diagnose model-routing failures.

The result should conceptually contain:

```text
requestId
testId
testType
status
output
evaluation
modelResolution
gateway
latency
error
metadata
```

Do not expose raw provider-specific response structures as the public client contract.

---

# 7. IMPLEMENT MODEL RESOLUTION

Create:

```text
services/kira-testing/src/resolver/testing-model.ts
```

Its responsibility is:

```text
logical Kira Testing request
        ↓
resolve configured Kira-testing model/combo
        ↓
return resolved routing information
```

The resolver must use configuration/environment conventions already established by the repository.

The logical service name must be:

```text
kira-testing
```

Do not hard-code:

```text
agy/gemini-...
kr/claude-...
kimi...
openai...
anthropic...
```

inside tester/client code.

If the existing OmniRoute integration requires a model/combo identifier, retrieve it from configuration.

The resolver should fail clearly if:

- no Kira-testing configuration exists;
- configuration is malformed;
- the requested testing mode is unsupported.

---

# 8. IMPLEMENT OMNIROUTE GATEWAY

Create:

```text
services/kira-testing/src/gateway/omniroute.ts
```

This is the only layer that should understand the concrete OmniRoute request/response mechanics.

Responsibilities:

1. accept resolved Kira-testing routing information;
2. construct the OmniRoute request;
3. send the request;
4. capture response metadata;
5. normalise the result;
6. handle errors;
7. return a provider-independent result to the service.

The gateway must not leak provider-specific assumptions into:

```text
naive-tester
red-team
kira-testing-client
```

---

# 9. IMPLEMENT TEST API

Create:

```text
services/kira-testing/src/api/test.ts
```

This is the normal testing entry point.

Flow:

```text
test request
    ↓
validate schema
    ↓
resolve Kira-testing model
    ↓
invoke OmniRoute
    ↓
normalise response
    ↓
return test result
```

---

# 10. IMPLEMENT RED-TEAM API

Create:

```text
services/kira-testing/src/api/redteam.ts
```

Flow:

```text
red-team request
    ↓
validate red-team schema
    ↓
resolve Kira-testing model
    ↓
invoke OmniRoute
    ↓
normalise response
    ↓
return red-team result
```

The service must not assume that red-team testing requires a particular model provider.

The red-team system uses the same central Kira-testing model infrastructure.

---

# 11. IMPLEMENT KIRA TESTING CLIENT

Create:

```text
packages/kira-testing-client/src/index.ts
```

This is the public interface consumed by other repositories.

Expose a minimal API such as:

```text
test(...)
redTeam(...)
```

Use whatever exact naming best fits the existing repository conventions, but preserve the semantic distinction.

The client must:

- provide strong TypeScript types;
- validate required inputs;
- invoke the central Kira-testing service;
- return the stable result schema;
- expose useful errors;
- avoid OmniRoute knowledge.

The client must NOT:

- choose models;
- contain provider names;
- implement model fallback;
- contain tester-specific logic;
- contain red-team attack logic.

---

# 12. IMPLEMENT CLI

Create:

```text
packages/kira-testing-cli/src/index.ts
```

Provide a command-line interface capable of invoking the shared testing service.

At minimum support:

```text
kira-testing test
kira-testing red-team
```

The CLI should be useful from any repository after the package is installed/linked according to the existing `cais-shared-services` package architecture.

It should support machine-readable output suitable for automation.

For example:

```text
--json
```

if consistent with existing CLI conventions.

Do not invent a complicated CLI framework unless one already exists or is justified.

---

# 13. NAIVE TESTER

Create or adapt:

```text
testers/naive-tester/
```

The naive tester must invoke:

```text
kira-testing-client
```

It must NOT invoke OmniRoute directly.

It must NOT contain model-selection logic.

It must NOT contain provider-specific credentials.

Its dependency direction must therefore be:

```text
naive-tester
      ↓
kira-testing-client
```

The tester should demonstrate at least one complete test request and interpretation of the returned result.

---

# 14. RED TEAM

Create or adapt:

```text
testers/red-team/
```

The red-team implementation must invoke:

```text
kira-testing-client
```

and specifically its red-team operation.

It must NOT invoke OmniRoute directly.

It must NOT contain Kira-testing model-selection logic.

Dependency:

```text
red-team
      ↓
kira-testing-client
```

The red-team package should contain the testing strategy/scenario logic, while the shared service owns model invocation.

---

# 15. SHARED SCHEMAS

Create the shared testing schema area:

```text
schemas/testing/
```

Use it for schemas that genuinely need to be shared across:

- service;
- client;
- CLI;
- naive tester;
- red team.

Avoid creating duplicate definitions.

There must be one authoritative contract for requests/results wherever practical.

If the existing repository uses another schema mechanism, adapt to that mechanism rather than introducing unnecessary duplication.

---

# 16. DOCUMENT THE ARCHITECTURE

Create:

```text
docs/KIRA-Testing-Architecture.md
```

Document:

### Purpose

Why Kira Testing exists as a central service.

### Dependency direction

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

### Repository usage

Explain how another repository invokes Kira Testing.

### Configuration

Document exactly where the Kira-testing model/combo is configured.

### Authentication

Document how callers authenticate with the shared service, using existing repository conventions.

Do not put secrets in documentation.

### Error handling

Document model-resolution failures separately from gateway failures.

### Extension model

Explain how future testers can use Kira Testing without modifying OmniRoute integration.

---

# 17. IMPORTANT — DO NOT CREATE A SECOND MODEL ROUTER

There must be exactly one logical model-resolution boundary.

Bad:

```text
naive-tester
   ↓
choose Gemini
   ↓
OmniRoute
```

Bad:

```text
red-team
   ↓
choose Claude
   ↓
OmniRoute
```

Correct:

```text
naive-tester
   ↓
client
   ↓
kira-testing
   ↓
testing-model resolver
   ↓
OmniRoute
   ↓
configured Kira-testing combo
```

This separation is mandatory.

---

# 18. TESTING REQUIREMENTS

After implementation, do not merely run TypeScript compilation.

Test the architecture at multiple levels.

## Test 1 — Typecheck

All affected packages must typecheck.

## Test 2 — Unit test model resolver

Verify:

### configured model

A valid Kira-testing configuration resolves correctly.

### missing configuration

Missing configuration produces a clear failure.

### malformed configuration

Malformed configuration produces a clear failure.

---

# 19. TEST OMNIROUTE GATEWAY

Mock/stub OmniRoute where appropriate.

Verify:

1. request construction;
2. response normalisation;
3. latency capture;
4. successful response;
5. provider/gateway error;
6. timeout/error handling;
7. malformed response handling.

Do not require a live model call for every unit test.

---

# 20. TEST CLIENT

Verify:

```text
client.test()
```

reaches the correct service interface.

Verify:

```text
client.redTeam()
```

reaches the red-team service interface.

Verify that client callers cannot accidentally specify an arbitrary provider/model if the public API is not intended to permit that.

---

# 21. TEST NAIVE TESTER

Run a complete test using:

```text
naive-tester
```

and verify the call path is:

```text
naive-tester
→ kira-testing-client
→ kira-testing
→ resolver
→ OmniRoute
→ Kira-testing combo
```

Capture enough logging/metadata to prove the path.

---

# 22. TEST RED TEAM

Run a complete test using:

```text
red-team
```

and verify:

```text
red-team
→ kira-testing-client
→ kira-testing
→ resolver
→ OmniRoute
→ Kira-testing combo
```

Again, verify that no direct OmniRoute invocation exists inside the tester.

---

# 23. ARCHITECTURAL STATIC CHECK

Search the tester repositories for:

```text
OmniRoute
OpenRouter
Anthropic
OpenAI
Gemini
Claude
Kimi
model=
provider=
api_key
```

and inspect every result.

The testers should not contain provider/model routing implementation.

If a match is legitimate documentation or test fixture, leave it.

If it represents actual routing logic, remove it.

---

# 24. CROSS-REPOSITORY TEST

The most important integration test is proving that Kira Testing can be consumed from another repository.

Simulate a separate repository containing only the necessary dependency/configuration.

For example:

```text
some-other-repo/
    tester.ts
```

with:

```text
import { test } from "@cais/kira-testing-client";
```

or the actual package name established by the repository.

Run:

```text
test(...)
```

and prove it reaches the shared service.

The consuming repository must not need to copy:

```text
services/kira-testing/
```

into itself.

---

# 25. TEST FAILURE MODES

Explicitly test and report these separately:

### A. Client failure

The client cannot invoke the service.

### B. Service validation failure

The request is invalid.

### C. Model resolution failure

Kira-testing model/combo cannot be resolved.

### D. OmniRoute failure

OmniRoute rejects or cannot execute the request.

### E. Model execution failure

The resolved Kira-testing model fails.

### F. Response normalisation failure

The provider response cannot be converted into the stable testing result.

Do not collapse all of these into:

```text
Error: test failed
```

---

# 26. OBSERVABILITY

Every request should have a correlation/request ID.

Where practical capture:

```text
requestId
testId
testType
repository
resolved logical service
resolved model/combo identifier
gateway
latency
status
error
```

Do not log:

- API keys;
- credentials;
- secrets;
- unnecessary sensitive request content.

---

# 27. SECURITY

Credentials must come from the existing environment/configuration mechanism.

Never:

- hard-code secrets;
- commit credentials;
- place provider API keys in tester packages;
- expose secrets in result objects;
- expose secrets in logs.

The tester repositories should require only the credentials/configuration necessary to invoke the shared service.

---

# 28. DO NOT ALTER KIRA'S DOMAIN MODEL

The Kira Testing implementation is infrastructure.

Do not modify Kira's canonical organisational model merely to accommodate testing.

The canonical model states that implementation structures must not redefine canonical organisational meaning.

In particular, do not introduce testing concepts that alter:

- Organisation;
- Person;
- Ownership;
- Consultant;
- Engagement;
- Kira Instance;
- Subscription;
- Commercial Arrangement;
- Organisational Knowledge.

If integration with Kira requires an identifier, use an explicit testing/infrastructure identifier rather than corrupting domain semantics.

---

# 29. TESTING MODEL CONFIGURATION

The service must make it obvious which model/combo is being used.

The output should be capable of showing something conceptually like:

```text
Kira Testing
logical service: kira-testing
resolved route: <configured route>
gateway: OmniRoute
status: success
```

This is important because previous testing runs have returned errors from dynamically resolved models.

The implementation must make it possible to distinguish:

```text
Kira-testing configuration problem
```

from:

```text
OmniRoute problem
```

from:

```text
underlying model problem
```

---

# 30. NO SILENT FALLBACK TO KIRA CODING

If Kira-testing cannot resolve its configured combo:

```text
FAIL
```

Do not automatically substitute:

```text
kira-coding
```

Do not automatically substitute an arbitrary free model.

Do not automatically substitute Anthropic/OpenAI/Gemini/etc.

A missing Kira-testing configuration is an infrastructure failure that must be visible.

---

# 31. ACCEPTANCE CRITERIA

The implementation is complete only when all of the following are true.

### Structure

[ ] `services/kira-testing` exists.

[ ] `packages/kira-testing-client` exists.

[ ] `packages/kira-testing-cli` exists.

[ ] `testers/naive-tester` exists.

[ ] `testers/red-team` exists.

[ ] `schemas/testing` exists.

[ ] `docs/KIRA-Testing-Architecture.md` exists.

### Architecture

[ ] Naive tester depends on client.

[ ] Red team depends on client.

[ ] Client depends on service interface.

[ ] Service owns model resolution.

[ ] Service owns OmniRoute integration.

[ ] OmniRoute is not directly called by testers.

[ ] Provider/model selection is not embedded in testers.

[ ] Kira-testing has its own logical model/combo configuration.

[ ] Kira-coding is not used as an implicit fallback.

### Code quality

[ ] TypeScript passes.

[ ] Lint passes if configured.

[ ] Unit tests pass.

[ ] Integration tests pass where environment permits.

[ ] Error handling is explicit.

[ ] Secrets are not committed.

### Functional

[ ] `naive-tester` successfully invokes Kira Testing.

[ ] `red-team` successfully invokes Kira Testing.

[ ] Model resolution is observable.

[ ] OmniRoute invocation is observable.

[ ] Results use a stable provider-independent schema.

[ ] Failure states are distinguishable.

### Cross-repository

[ ] A separate repository can import/use `kira-testing-client`.

[ ] The separate repository does not need to know OmniRoute details.

[ ] The separate repository does not need to know the underlying model provider.

---

# 32. FINAL REQUIRED REPORT

When implementation and testing are complete, provide a concise report containing:

## Files created

List every file created.

## Files modified

List every existing file modified.

## Packages added

List package/dependency changes.

## Architecture

Show the final dependency graph.

## Model configuration

State exactly where the Kira-testing model/combo is configured.

Do NOT print secrets.

## Tests executed

List each command and result.

## Integration result

State whether:

```text
naive-tester → client → service → OmniRoute → Kira-testing
```

worked.

State whether:

```text
red-team → client → service → OmniRoute → Kira-testing
```

worked.

## Failures

List any remaining failures verbatim enough to diagnose them.

Do not claim success if only unit tests passed.

## Remaining work

List anything that could not be completed because of missing:

- environment variables;
- OmniRoute configuration;
- service availability;
- package infrastructure;
- credentials;
- external dependencies.

---

# 33. EXECUTION RULE

Proceed autonomously.

Do not merely tell me what files I should create.

Actually:

1. inspect the repository;
2. create the files;
3. implement the code;
4. integrate with existing configuration;
5. run tests;
6. fix failures;
7. run the tests again;
8. verify dependency direction;
9. verify cross-repository invocation;
10. report exactly what was changed and what passed/failed.

Do not stop after the first compile error.

Do not paper over architectural problems with `any`, disabled tests, ignored type errors, or fake success responses.

The objective is a **working central Kira Testing capability**, not a scaffold.