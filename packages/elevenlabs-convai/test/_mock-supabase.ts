// Minimal chainable Supabase client mock for unit tests.
// A resolver function decides the { data, error } for each query based on the captured
// context (table, op, filters, payload). Awaiting the builder, .single(), or
// .maybeSingle() all resolve through the resolver.

export interface QueryCtx {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | null;
  filters: Array<{ method: string; args: unknown[] }>;
  payload?: unknown;
  conflict?: string;
  terminal: 'single' | 'maybeSingle' | 'await' | null;
}

export type Resolver = (ctx: QueryCtx) => { data: unknown; error: unknown };
export type RpcResolver = (name: string, args: unknown) => { data: unknown; error: unknown };

export interface MockSupabase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  calls: QueryCtx[];
  rpcCalls: Array<{ name: string; args: unknown }>;
}

export function createMockSupabase(resolver: Resolver, rpcResolver?: RpcResolver): MockSupabase {
  const calls: QueryCtx[] = [];
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  function makeBuilder(table: string) {
    const ctx: QueryCtx = { table, op: null, filters: [], terminal: null };
    const finalize = (terminal: QueryCtx['terminal']) => {
      ctx.terminal = terminal;
      calls.push(ctx);
      return resolver(ctx);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select(...args: unknown[]) { ctx.op = ctx.op ?? 'select'; ctx.filters.push({ method: 'select', args }); return builder; },
      insert(payload: unknown) { ctx.op = 'insert'; ctx.payload = payload; return builder; },
      update(payload: unknown) { ctx.op = 'update'; ctx.payload = payload; return builder; },
      upsert(payload: unknown, opts?: { onConflict?: string }) { ctx.op = 'upsert'; ctx.payload = payload; ctx.conflict = opts?.onConflict; return builder; },
      delete() { ctx.op = 'delete'; return builder; },
      eq(...args: unknown[]) { ctx.filters.push({ method: 'eq', args }); return builder; },
      is(...args: unknown[]) { ctx.filters.push({ method: 'is', args }); return builder; },
      in(...args: unknown[]) { ctx.filters.push({ method: 'in', args }); return builder; },
      ilike(...args: unknown[]) { ctx.filters.push({ method: 'ilike', args }); return builder; },
      order(...args: unknown[]) { ctx.filters.push({ method: 'order', args }); return builder; },
      limit(...args: unknown[]) { ctx.filters.push({ method: 'limit', args }); return builder; },
      single() { return Promise.resolve(finalize('single')); },
      maybeSingle() { return Promise.resolve(finalize('maybeSingle')); },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(finalize('await')).then(onF, onR);
      },
    };
    return builder;
  }

  const client = {
    from(table: string) { return makeBuilder(table); },
    rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResolver ? rpcResolver(name, args) : { data: null, error: new Error('no rpc') });
    },
  };

  return { client, calls, rpcCalls };
}

/** Convenience: find the first captured call matching table + op. */
export function findCall(calls: QueryCtx[], table: string, op: QueryCtx['op']): QueryCtx | undefined {
  return calls.find((c) => c.table === table && c.op === op);
}
