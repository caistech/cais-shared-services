"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitInterview, type SubmitState } from "./actions";

interface Props {
  installId: string;
  mcp: string;
  trigger: string | null;
}

const initialState: SubmitState = { ok: false };

export function InterviewForm({ installId, mcp, trigger }: Props) {
  const [state, formAction] = useActionState(submitInterview, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="install_id" value={installId} />
      <input type="hidden" name="mcp" value={mcp} />
      {trigger ? <input type="hidden" name="trigger" value={trigger} /> : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Your email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="you@example.com"
        />
        <p className="mt-1 text-xs text-slate-500">
          Only used to route follow-up — not added to any marketing list.
        </p>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-slate-700">
          Are you building this for someone else, or for yourself?
        </legend>
        <div className="mt-2 space-y-2">
          <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
            <input
              type="radio"
              name="triage"
              value="for_someone_else"
              required
              className="mt-1"
            />
            <span className="text-sm">
              <strong className="block text-slate-900">For someone else</strong>
              <span className="text-slate-600">
                A client, employer, or internal team. We&apos;ll route you to the Connexions Platform
                Trust Sprint — a paid engagement that builds the compliance flow with your stakeholders.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
            <input type="radio" name="triage" value="for_self" required className="mt-1" />
            <span className="text-sm">
              <strong className="block text-slate-900">For myself</strong>
              <span className="text-slate-600">
                An indie project, side build, or learning exercise. We&apos;ll capture what you told us
                so we can prioritise the right next tools — no follow-up sales pitch.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div>
        <label htmlFor="free_text" className="block text-sm font-medium text-slate-700">
          What are you building?
        </label>
        <textarea
          id="free_text"
          name="free_text"
          required
          rows={4}
          minLength={5}
          maxLength={2000}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="A sentence or two on the use case — fintech KYC, marketplace seller onboarding, audit tooling, etc."
        />
      </div>

      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Sending..." : "Send"}
    </button>
  );
}
