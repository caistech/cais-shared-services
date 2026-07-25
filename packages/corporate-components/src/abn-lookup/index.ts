// Subpath export: `@caistech/corporate-components/abn-lookup`.
//
// ROUTE ONLY. `AbnLookupField.tsx` in this directory stays copy-paste, because
// it imports the consumer's shadcn/ui components through their own `@/`
// tsconfig paths (`@/components/ui/input` etc.) and cannot resolve inside the
// package. The route has no such coupling — it is web-standard Request/Response
// and depends only on @caistech/abn-lookup — so it IS published, which is what
// removes the three duplicated copies across products.
//
// Wire it in one line:
//   // app/api/abn-lookup/route.ts
//   export { GET } from "@caistech/corporate-components/abn-lookup";
export { createAbnLookupRoute, GET } from "./route";
export type { AbnLookupRouteOptions } from "./route";
