# Project State — cais-shared-services

> Save-game per portfolio convention (.context/PROJECT_STATE.md). Updated 2026-08-23.

## Last session (2026-08-23) — zero-cost judging for the validation agents

**Done (verified with `node --check`):**
- `scripts/agents/lib.mjs`: `loadShots(dir)` export (reads `.png`s, filenames become labels);
  `visionVerdicts()` now branches to a local judge when `LOCAL_VISION_MODEL` is set
  (`LOCAL_VISION_API` defaults to Ollama `http://localhost:11434/api/generate`; parses both
  `{response}` and `{choices[].message.content}` shapes). `ANTHROPIC_API_KEY` optional in that mode.
- `scripts/agents/naive-tester.mjs`: `--shots <dir>` (offline re-verdict, no browser/login),
  `--mock` (records hardcoded pass/na verdicts, no vision call), validation relaxed accordingly.
- New `scripts/agents/README.md` documents entry points, env, deps, consumers, cost modes.

**Deliberately unchanged:** the other five agents consuming `lib.mjs` (additive change only;
they inherit local-judge support for free). No consumer reconciliation needed — verified additive.

**Not a bug fix:** no bug-knowledge.json / Mnemo / SayFix entry recorded (enhancement, not a defect).

## Next
- Optional: point CI at `--shots` capture-once/re-verdict flow to cut runner minutes.
- If `LOCAL_VISION_MODEL` gets set globally, all six agents silently switch judges — decide
  whether that's wanted per-agent before doing it in shared env.
