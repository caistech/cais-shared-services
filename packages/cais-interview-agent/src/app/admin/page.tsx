import { getServerSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface EngagementRow {
  install_id: string;
  prompted_at: string | null;
  interview_started_at: string | null;
  interview_completed_at: string | null;
  routing: "connexions" | "data_only" | null;
  routing_payload: {
    email?: string;
    free_text?: string;
    triggered_by_tool?: string | null;
    triage?: string;
    mcp?: string;
  } | null;
}

interface InstallRow {
  install_id: string;
  installed_at: string;
  mcp_name: string;
}

interface CallCountRow {
  install_id: string;
  count: number;
}

async function loadData(): Promise<{
  engagements: EngagementRow[];
  installsById: Map<string, InstallRow>;
  callsById: Map<string, number>;
  totals: { installs: number; calls: number; engagements: number; submissions: number };
}> {
  const client = getServerSupabase();

  const { data: engagementsRaw } = await client
    .from("mcp_engagement")
    .select("*")
    .order("interview_completed_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const engagements = (engagementsRaw ?? []) as EngagementRow[];

  const installIds = engagements.map((e) => e.install_id);
  const installsById = new Map<string, InstallRow>();
  const callsById = new Map<string, number>();

  if (installIds.length > 0) {
    const { data: installsRaw } = await client
      .from("mcp_install")
      .select("install_id, installed_at, mcp_name")
      .in("install_id", installIds);
    for (const row of (installsRaw ?? []) as InstallRow[]) {
      installsById.set(row.install_id, row);
    }

    // Per-install call counts. Single grouped query would need PostgREST RPC;
    // for v1 (top-100 engagements) we issue N count queries in parallel.
    const counts = await Promise.all(
      installIds.map(async (id) => {
        const { count } = await client
          .from("mcp_call")
          .select("*", { count: "exact", head: true })
          .eq("install_id", id);
        return { id, count: count ?? 0 };
      }),
    );
    for (const c of counts) callsById.set(c.id, c.count);
  }

  const [{ count: totalInstalls }, { count: totalCalls }, { count: totalEngagements }, { count: totalSubmissions }] =
    await Promise.all([
      client.from("mcp_install").select("*", { count: "exact", head: true }),
      client.from("mcp_call").select("*", { count: "exact", head: true }),
      client.from("mcp_engagement").select("*", { count: "exact", head: true }),
      client.from("mcp_engagement").select("*", { count: "exact", head: true }).not("interview_completed_at", "is", null),
    ]);

  return {
    engagements,
    installsById,
    callsById,
    totals: {
      installs: totalInstalls ?? 0,
      calls: totalCalls ?? 0,
      engagements: totalEngagements ?? 0,
      submissions: totalSubmissions ?? 0,
    },
  };
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("en-AU", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney",
  });
}

export default async function AdminPage() {
  const { engagements, installsById, callsById, totals } = await loadData();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">CAIS Interview — submissions</h1>
        <p className="text-xs text-slate-500">Read-only view across the cais-au-compliance telemetry tables.</p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Installs" value={totals.installs} />
        <Stat label="Tool calls" value={totals.calls} />
        <Stat label="Prompts fired" value={totals.engagements} />
        <Stat label="Submissions" value={totals.submissions} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
          Recent engagements ({engagements.length})
        </h2>
        {engagements.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            No engagement rows yet. The first one appears when an install crosses the 10-call threshold.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Routing</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Triage</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Trigger</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-700">Calls</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Prompted</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Submitted</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">What they&apos;re building</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {engagements.map((e) => {
                  const install = installsById.get(e.install_id);
                  const calls = callsById.get(e.install_id) ?? 0;
                  const payload = e.routing_payload ?? {};
                  return (
                    <tr key={e.install_id} className="align-top">
                      <td className="px-3 py-2 text-slate-900">{payload.email ?? "—"}</td>
                      <td className="px-3 py-2">
                        {e.routing ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              e.routing === "connexions"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-slate-200 text-slate-800"
                            }`}
                          >
                            {e.routing}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{payload.triage ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">
                        {payload.triggered_by_tool ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{calls}</td>
                      <td className="px-3 py-2 text-slate-600">{fmt(e.prompted_at)}</td>
                      <td className="px-3 py-2 text-slate-600">{fmt(e.interview_completed_at)}</td>
                      <td className="px-3 py-2 max-w-md text-slate-600">
                        <span className="line-clamp-3">{payload.free_text ?? "—"}</span>
                        <span className="mt-1 block font-mono text-xs text-slate-400">
                          {install?.installed_at ? `installed ${fmt(install.installed_at)} · ` : ""}
                          {e.install_id.slice(0, 8)}…
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}
