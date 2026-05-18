import { isUuid, getServerSupabase } from "@/lib/supabase";
import { InterviewForm } from "./InterviewForm";

interface SearchParams {
  install_id?: string | string[];
  mcp?: string | string[];
  trigger?: string | string[];
}

function first(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

async function markStarted(installId: string, mcp: string): Promise<void> {
  try {
    const client = getServerSupabase();
    await client
      .from("mcp_install")
      .upsert({ install_id: installId, mcp_name: mcp }, { onConflict: "install_id", ignoreDuplicates: true });
    await client.from("mcp_engagement").upsert(
      { install_id: installId, interview_started_at: new Date().toISOString() },
      { onConflict: "install_id", ignoreDuplicates: false },
    );
  } catch (err) {
    console.warn("[interview] markStarted failed", err);
  }
}

export default async function InterviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const installId = first(params.install_id);
  const mcp = first(params.mcp) ?? "au-compliance";
  const trigger = first(params.trigger);

  if (!installId || !isUuid(installId)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-slate-900">Missing install id</h1>
        <p className="mt-3 text-slate-600">
          This page is reached from inside an MCP client after the funnel prompt fires. Open the link
          from the MCP&apos;s response — it includes the install id we need to match your response to
          your usage.
        </p>
      </main>
    );
  }

  // Best-effort mark started (idempotent upsert). Doesn't block render.
  void markStarted(installId, mcp);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-blue-600">CAIS AU Compliance</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Tell us what you&apos;re building</h1>
        <p className="mt-3 text-slate-600">
          You&apos;ve used the CAIS AU Compliance MCP a few times. Two minutes of your input helps us
          route you to the right next step — whether that&apos;s a paid Platform Trust Sprint with
          your team, or just better tools next quarter.
        </p>
      </header>
      <InterviewForm installId={installId} mcp={mcp} trigger={trigger} />
      <footer className="mt-12 text-xs text-slate-500">
        Install id: <span className="font-mono">{installId.slice(0, 8)}…</span>
        {trigger ? (
          <>
            {" · Triggered by "}
            <span className="font-mono">{trigger}</span>
          </>
        ) : null}
      </footer>
    </main>
  );
}
