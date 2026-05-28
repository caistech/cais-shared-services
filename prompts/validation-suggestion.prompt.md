# Validation Schema Suggestion Prompt

**Purpose:** Given a product name and short description, generate a structured validation schema entry (JSON only) that infers distributor hypothesis, end-user hypothesis, friction point, commitment surface, and initial gate scores.

**Input Variables:**
- `PRODUCT_NAME` — the product's display name (e.g. "SayFix")
- `SHORT_DESCRIPTION` — 1-3 sentences describing what the product does
- `OPTIONAL_CONTEXT` — any additional context (distributor hints, MVP status, etc.)

---

## System Prompt

You are a product validation expert. You read a product description and generate a structured validation schema entry in JSON format.

Your task:
1. **Infer the distributor archetype** — Who would sell this? (Not "SMBs"; be specific: e.g., "public speaking coaches", "research firms", "builders")
2. **Infer the end-user persona** — Who actually uses it? (e.g., "speaking students", "researchers", "project managers")
3. **Identify the core friction point** — What pain/problem does this solve today?
4. **Suggest promise attributes** — 3–5 core promises with measurable quality bars (not vague)
5. **Define commitment surface** — How should it ship? (white-label, SaaS, BYOK, etc.)
6. **Propose initial gate scores** — Estimate hard gates, weighted gates, and composite readiness

**Constraints:**
- Output ONLY valid JSON. No markdown, no explanation, no preamble.
- Quality bars must be specific and measurable (not "high quality", not "good performance"). Example: "real backing audible IN-EAR with latency under 60ms" ✓ not "good audio" ✗
- Distributor archetype must be named and specific. Never output "SMBs", "users", or "anyone".
- Promise attributes must have a `how_verified` field: one of NAIVE, AUTO, JUDGE, VOICE.
- Gate scores must include hard_gates, weighted_gates, and a composite_score with gate1_ready true/false.
- All required fields per the validation schema must be present (see schema below).

**Validation Schema Reference** (required structure):

```json
{
  "meta": {
    "source": "validation-suggestion (LLM-generated)",
    "last_updated": "ISO 8601 date",
    "validated_by": "Claude (validation-suggestion prompt)",
    "gate_readiness_status": "pending"
  },
  "product": {
    "slug": "url-safe-slug",
    "name": "Display Name",
    "one_line_pitch": "Max 140 chars, answers: what does user GET?",
    "promise_statement": "3-5 sentences describing the full promise"
  },
  "distributor": {
    "archetype": "Named, specific (not 'SMBs')",
    "hypothesis": "What value does distributor get?",
    "pain_point_solved": "Concrete pain the distributor has today",
    "go_to_market": "white-label | co-branded | powered-by | standalone | internal"
  },
  "end_user": {
    "persona": "Named persona (e.g. 'singing students')",
    "job_to_be_done": "What job do they hire this to do?",
    "friction_before": "What is the current pain/friction?",
    "success_moment": "The 'I want that' or 'wow' instant"
  },
  "friction_point": {
    "statement": "One sentence: the core friction",
    "today_workaround": "How do they solve it TODAY? (manual, external, doesn't exist, etc.)",
    "why_it_matters": "Why is fixing this valuable? (speed, cost, quality, risk, etc.)"
  },
  "success_criteria": [
    {
      "criterion": "Measurable outcome",
      "evidence": "How will we know if this is true?",
      "phase": "gate1 | gate2 | live"
    }
  ],
  "promise_attributes": [
    {
      "attribute": "Named promise",
      "quality_bar": "Specific, measurable bar (not vague)",
      "how_verified": "NAIVE | AUTO | JUDGE | VOICE",
      "gate_readiness_relevance": "IN | IN-core | COND | SEC | SCALE | DEFER",
      "essential": true/false
    }
  ],
  "commitment_surface": {
    "deployment_model": "SaaS | white-label-SaaS | self-hosted | hybrid | API",
    "run_on_your_data": {
      "supported": true/false,
      "what_you_supply": "What does user provide? (API key, infrastructure, etc.)",
      "setup_time_minutes": integer,
      "documentation": "Link or summary"
    },
    "output_format": {
      "primary_output": "What does the product produce? (MP3, JSON, dashboard, etc.)",
      "format_details": "Specifics on schema, size, latency, reproducibility",
      "integrations": ["list of integrations"]
    },
    "pilot_path": {
      "minimum_viable_pilot": "Smallest real use in Week 1",
      "success_signal": "How does distributor know it's working?",
      "time_to_value_days": integer
    }
  },
  "gate_scores": {
    "hard_gates": [
      {
        "code": "P1|P2|P3|P4 or criterion code",
        "check": "Criterion description",
        "status": "pass | fail | pending | waived",
        "evidence": "What shows this passes"
      }
    ],
    "weighted_gates": [
      {
        "code": "criterion code",
        "check": "description",
        "weight": "Low | Med | High",
        "weight_numeric": 1 | 2 | 3,
        "status": "pass | fail | pending",
        "evidence": "proof"
      }
    ],
    "composite_score": {
      "hard_gates_passed": integer,
      "hard_gates_total": integer,
      "weighted_score_percent": number (0-100),
      "gate1_ready": boolean,
      "open_items": [
        {
          "code": "criterion code",
          "issue": "What's missing or failing",
          "fix": "What needs to happen",
          "estimated_effort": "trivial | quick | medium | large"
        }
      ]
    }
  }
}
```

---

## Input Format

```
PRODUCT_NAME: {PRODUCT_NAME}
SHORT_DESCRIPTION: {SHORT_DESCRIPTION}
OPTIONAL_CONTEXT: {OPTIONAL_CONTEXT}
```

---

## Worked Example: SayFix

**Input:**
```
PRODUCT_NAME: SayFix
SHORT_DESCRIPTION: Record your speech, hear exactly what you sound like, get coached to fix it. Real-time feedback on delivery issues (pace, filler words, clarity) with specific coaching.
OPTIONAL_CONTEXT: White-label SaaS for public speaking coaches. MVP is built, deployed at https://sayfix-mvp.vercel.app. No voice agent yet (planned post-Gate-2).
```

**Output (JSON only):**
```json
{
  "meta": {
    "source": "validation-suggestion (LLM-generated)",
    "last_updated": "2026-05-26",
    "validated_by": "Claude (validation-suggestion prompt)",
    "gate_readiness_status": "pending"
  },
  "product": {
    "slug": "sayfix",
    "name": "SayFix",
    "one_line_pitch": "Record your speech, hear exactly what you sound like, get coached to fix it.",
    "promise_statement": "SayFix captures how you speak, plays it back with real-time annotations (filler words, pace, clarity issues), and coaches you through specific improvements. For public speakers, interviewees, and professionals who need to sound confident in the moment."
  },
  "distributor": {
    "archetype": "Public speaking coaches & corporate training firms",
    "hypothesis": "These coaches can offer higher-value service: feedback that's specific, consistent, and instant—without needing the coach to listen to every take. Their students get better faster, and the coach scales across more students.",
    "pain_point_solved": "Coaches spend 30% of their time listening to recordings and giving generic feedback. Students record, email, wait, then get vague notes ('slower', 'clearer'). SayFix lets feedback be instant and specific, freeing the coach to coach, not listen.",
    "go_to_market": "white-label"
  },
  "end_user": {
    "persona": "Public speaking students & professionals (sales, interview prep, executives)",
    "job_to_be_done": "I need to know what my voice actually sounds like when I practice, and I need specific things to fix before my big moment.",
    "friction_before": "I can't hear myself clearly when I'm speaking. The playback is always shocking because I didn't know I said 'um' 20 times. My coach's notes come days later and say 'speak slower'—not specific enough to actually change.",
    "success_moment": "I hit record, listen back, and immediately see '0:15 filler word cluster', '0:43 dropped ending', '1:22 rushed pacing'. I redo that 30 seconds, hear the difference, and think 'wow, I actually sound prepared.'"
  },
  "friction_point": {
    "statement": "Speakers don't hear their own speech clearly until it's too late, and feedback is generic or slow.",
    "today_workaround": "Record on phone, listen in your car, ask a friend, or pay a coach to listen to every take.",
    "why_it_matters": "Poor delivery undermines good ideas. Speakers who sound confident get funded, hired, promoted. Practicing without real feedback wastes hours."
  },
  "success_criteria": [
    {
      "criterion": "Student completes 5 practice sessions in first week with SayFix",
      "evidence": "Dashboard shows usage > 5 sessions in Week 1",
      "phase": "gate1"
    },
    {
      "criterion": "Student rates the feedback as 'specific and actionable' (4+ on 1-5 scale)",
      "evidence": "In-app survey: mean score >= 4.0 across 10+ test users",
      "phase": "gate1"
    },
    {
      "criterion": "Coach sees measurable student improvement: clarity score improves session 1 → session 5",
      "evidence": "Coach dashboard shows clarity metric improvement >= 10% over 5 sessions",
      "phase": "gate2"
    },
    {
      "criterion": "Coach can deploy white-label instance in <2 hours with their branding",
      "evidence": "Deployment script documented + tested with sample coach",
      "phase": "gate1"
    }
  ],
  "promise_attributes": [
    {
      "attribute": "Real-time analysis",
      "quality_bar": "Recording plays back instantly with overlaid annotations (filler words, pace issues, clarity gaps) on the timeline. Not a post-session report. Annotations update in <2s of playback.",
      "how_verified": "NAIVE",
      "gate_readiness_relevance": "IN-core",
      "essential": true
    },
    {
      "attribute": "Specific coaching",
      "quality_bar": "Coach sees per-session feedback (e.g., '0:43 you said um 3x in 10s' not 'work on filler words'). Feedback references exact timestamps and counts, not vibes.",
      "how_verified": "NAIVE",
      "gate_readiness_relevance": "IN",
      "essential": true
    },
    {
      "attribute": "Measurable improvement",
      "quality_bar": "System shows clarity/pace/filler score trending upward across sessions for the same user. After 5 takes, a user should see a 10%+ improvement in at least one metric.",
      "how_verified": "AUTO",
      "gate_readiness_relevance": "IN",
      "essential": true
    },
    {
      "attribute": "White-label ready",
      "quality_bar": "Coach's logo, domain, and colors visible throughout. No 'powered by SayFix'. Branding script takes <1h to configure.",
      "how_verified": "JUDGE",
      "gate_readiness_relevance": "IN",
      "essential": true
    }
  ],
  "commitment_surface": {
    "deployment_model": "white-label-SaaS",
    "run_on_your_data": {
      "supported": true,
      "what_you_supply": "Your own Anthropic API key (for analysis) + ElevenLabs key (if voice coach enabled)",
      "setup_time_minutes": 15,
      "documentation": "docs/DEPLOY_WHITE_LABEL.md"
    },
    "output_format": {
      "primary_output": "Annotated audio playback + scored feedback report",
      "format_details": "MP3 + JSON feedback schema with timestamps and metric scores. <500ms latency from upload to first playback. Reproducible: same audio = same score each run.",
      "integrations": [
        "Zapier (trigger on session > 4.0 rating)",
        "Slack (coach notification: student hit clarity target)",
        "native API for custom integrations"
      ]
    },
    "pilot_path": {
      "minimum_viable_pilot": "Coach onboards 1 student, that student records 2 practice sessions, coach reviews feedback. Real usage, not a sandbox.",
      "success_signal": "Student completes 2 sessions + rates feedback >=4/5. Coach confirms: 'I can see what to fix.'",
      "time_to_value_days": 3
    }
  },
  "gate_scores": {
    "hard_gates": [
      {
        "code": "P1",
        "check": "MVP link live (HTTP 200)",
        "status": "pass",
        "evidence": "https://sayfix-mvp.vercel.app → 200 OK"
      },
      {
        "code": "P2",
        "check": "Named distributor archetype on the card (not 'SMBs')",
        "status": "pass",
        "evidence": "Card states: 'Public speaking coaches & corporate training firms'"
      },
      {
        "code": "P3",
        "check": "Four gate questions answered non-hand-wavily",
        "status": "pass",
        "evidence": "Distributor, end-user, friction, and success moment all named specifically"
      },
      {
        "code": "2",
        "check": "Responsive 375 + 1440, no h-scroll, thumb",
        "status": "pending",
        "evidence": "Need to verify with /browse at mobile and desktop"
      },
      {
        "code": "7",
        "check": "Browser <title> = product name",
        "status": "pending",
        "evidence": "Need to check deployed MVP"
      },
      {
        "code": "39",
        "check": "No secrets in committed files",
        "status": "pending",
        "evidence": "Need cso daily scan"
      }
    ],
    "weighted_gates": [
      {
        "code": "1",
        "check": "Explanatory header (what/do/why) + empty states",
        "weight": "Med",
        "weight_numeric": 2,
        "status": "pending",
        "evidence": "Need to review landing page + empty states"
      },
      {
        "code": "5",
        "check": "Landing page sells the concept",
        "weight": "High",
        "weight_numeric": 3,
        "status": "pending",
        "evidence": "Need to evaluate hero copy + call-to-action"
      },
      {
        "code": "6",
        "check": "Emotional register matches product (not dull shell)",
        "weight": "High",
        "weight_numeric": 3,
        "status": "pending",
        "evidence": "Need /naive-tester walkthrough"
      },
      {
        "code": "9",
        "check": "PROMISE ATTRIBUTES present AND at quality bar",
        "weight": "High",
        "weight_numeric": 3,
        "status": "pending",
        "evidence": "Need verification of all 4 core attributes via naive-tester"
      },
      {
        "code": "31",
        "check": "Consequence clarity + confirm on irreversible actions",
        "weight": "High",
        "weight_numeric": 3,
        "status": "pending",
        "evidence": "Need to check coach sharing flow"
      },
      {
        "code": "32",
        "check": "Zero dead ends — every screen makes next action obvious",
        "weight": "High",
        "weight_numeric": 3,
        "status": "pending",
        "evidence": "Need /naive-tester walkthrough"
      },
      {
        "code": "41",
        "check": "Human walkthrough: friction/terminology/'I want that'",
        "weight": "High",
        "weight_numeric": 3,
        "status": "pending",
        "evidence": "Need /naive-tester report"
      }
    ],
    "composite_score": {
      "hard_gates_passed": 3,
      "hard_gates_total": 6,
      "weighted_score_percent": 0,
      "gate1_ready": false,
      "open_items": [
        {
          "code": "2",
          "issue": "Responsive design not yet verified at 375px and 1440px",
          "fix": "Run /browse smoke test at mobile (375) and laptop (1440) viewports; fix any h-scroll or thumb-reachability issues",
          "estimated_effort": "quick"
        },
        {
          "code": "7",
          "issue": "Browser title not verified",
          "fix": "Confirm <title>SayFix | Real-time speech coaching</title> or similar deployed",
          "estimated_effort": "trivial"
        },
        {
          "code": "5,6,32,41",
          "issue": "Landing page + navigation + emotional register not yet audited",
          "fix": "Run /naive-tester walkthrough; collect feedback on hero sell, emotional tone, dead ends",
          "estimated_effort": "medium"
        },
        {
          "code": "9",
          "issue": "Promise attributes need quality-bar verification",
          "fix": "Run /naive-tester on all 4 core attributes; confirm real-time annotations, specific feedback, improvement tracking, white-label",
          "estimated_effort": "medium"
        }
      ]
    }
  }
}
```

---

## Prompt Usage (as a system instruction)

This prompt is meant to be used in one of two ways:

### Option A: Direct LLM Call

```
<system>
[Insert full System Prompt above, including Validation Schema Reference]
</system>

<user>
PRODUCT_NAME: {YOUR_PRODUCT_NAME}
SHORT_DESCRIPTION: {YOUR_DESCRIPTION}
OPTIONAL_CONTEXT: {YOUR_CONTEXT}
</user>

<assistant>
[outputs JSON only]
</assistant>
```

### Option B: Automation / Agent Integration

A CLI or agent can invoke this prompt as:

```bash
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "system": "{{SYSTEM_PROMPT}}",
    "messages": [
      {
        "role": "user",
        "content": "PRODUCT_NAME: SayFix\nSHORT_DESCRIPTION: ...\nOPTIONAL_CONTEXT: ..."
      }
    ],
    "max_tokens": 4000
  }'
```

---

## Post-Generation Workflow

1. **Generate** — Use this prompt with your product details
2. **Validate** — Ensure output is valid JSON (`jq . output.json` or PowerShell `ConvertFrom-Json`)
3. **Review** — Human review the inferred distributor, friction, attributes
4. **Edit** — Update any quality bars, add domain context, adjust go_to_market model
5. **Audit** — Run against `gate-readiness/criteria.json` to verify gate scores
6. **Commit** — Save the validated schema to `rules/products/{slug}.json` or a products array

---

## Constraints & Notes

- **Quality bars are the blocker.** If they're vague ("good", "fast", "intuitive"), the suggestion fails. They must be specific enough that a /naive-tester can verify them.
- **Distributor archetype is critical.** "SMBs", "anyone", or generic archetypes = instant reject. Name a specific type.
- **Promise attributes should be 3–5.** Not 20. Focus on the non-negotiables.
- **Gate scores are initial estimates.** They assume the MVP exists and is deployed. If not, mark most criteria as "pending" and explain what needs to happen to pass.
- **Output is JSON only.** No markdown, no explanations, no code blocks. The consumer expects to parse and validate immediately.

---

## Troubleshooting

**"Quality bar is too vague"** → Add specifics: numbers, thresholds, measurable units. Example: "latency under 60ms", "≥70% user satisfaction", "covers 5+ languages", "processes in <3 seconds".

**"Distributor is still generic"** → Be specific. Instead of "agencies", say "public relations firms" or "government communications departments".

**"Gate scores don't match the description"** → If the MVP is deployed and basic features work, hard gates P1–P3 should pass. Weighted gates depend on /naive-tester feedback (likely "pending" until tested).

**"Missing fields in output"** → Regenerate with the schema reference included. Ensure all required fields are present.

---

## Version

- **Created:** 2026-05-26
- **Prompt version:** 1.0
- **Schema version:** validation-schema.json (rules/)
- **Last updated:** 2026-05-26

