/**
 * Endpoint Registry
 *
 * Projects register their AI endpoints here. The red-team runner
 * iterates through registered endpoints on each scheduled run.
 *
 * Endpoints can be registered in-memory (for CI/testing) or
 * persisted to Supabase (for scheduled nightly runs).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { RegisteredEndpoint, ProbeCategory } from "./types";

export class EndpointRegistry {
  private supabase: SupabaseClient | null;
  private inMemory: Map<string, RegisteredEndpoint> = new Map();

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase ?? null;
  }

  /** Register an endpoint for red-team testing */
  async register(endpoint: RegisteredEndpoint): Promise<void> {
    this.inMemory.set(endpoint.id, endpoint);

    if (this.supabase) {
      try {
        await this.supabase.from("red_team_endpoints").upsert(
          {
            id: endpoint.id,
            project_id: endpoint.project_id,
            project_name: endpoint.project_name,
            name: endpoint.name,
            url: endpoint.url ?? null,
            method: endpoint.method ?? "POST",
            system_prompt: endpoint.systemPrompt ?? null,
            categories: endpoint.categories ?? null,
            has_tool_access: endpoint.hasToolAccess,
            processes_untrusted_content: endpoint.processesUntrustedContent,
            active: true,
          } as never,
          { onConflict: "id" }
        );
      } catch (err) {
        console.error("[red-team] Failed to persist endpoint:", err);
      }
    }
  }

  /** Remove an endpoint from the registry */
  async unregister(endpointId: string): Promise<void> {
    this.inMemory.delete(endpointId);

    if (this.supabase) {
      try {
        await this.supabase
          .from("red_team_endpoints")
          .update({ active: false } as never)
          .eq("id", endpointId);
      } catch (err) {
        console.error("[red-team] Failed to unregister endpoint:", err);
      }
    }
  }

  /** Get all active registered endpoints */
  async getAll(): Promise<RegisteredEndpoint[]> {
    if (this.supabase) {
      try {
        const { data } = await this.supabase
          .from("red_team_endpoints")
          .select("*")
          .eq("active", true);

        if (data) {
          return data.map((d: Record<string, unknown>) => ({
            id: d.id as string,
            project_id: d.project_id as string,
            project_name: d.project_name as string,
            name: d.name as string,
            url: d.url as string | undefined,
            method: d.method as string | undefined,
            systemPrompt: d.system_prompt as string | undefined,
            categories: d.categories as ProbeCategory[] | undefined,
            hasToolAccess: d.has_tool_access as boolean,
            processesUntrustedContent:
              d.processes_untrusted_content as boolean,
          }));
        }
      } catch (err) {
        console.error("[red-team] Failed to fetch endpoints:", err);
      }
    }

    return [...this.inMemory.values()];
  }

  /** Get endpoints for a specific project */
  async getByProject(projectId: string): Promise<RegisteredEndpoint[]> {
    const all = await this.getAll();
    return all.filter((e) => e.project_id === projectId);
  }
}
