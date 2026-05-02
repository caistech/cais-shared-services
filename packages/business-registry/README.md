# @caistech/business-registry

Multi-country business registry lookup. Provider pattern — built-in deterministic format validators for CN/VN/MY/AU/ID registration numbers; pluggable third-party API providers for live lookup.

Used by F2K CMPP self-registration **Gate G1 (Identity & legitimacy)** and any other portfolio project that needs to verify a business actually exists.

## Install

```bash
pnpm add @caistech/business-registry --legacy-peer-deps
```

## Validators (zero-dep, deterministic)

Run these first — they catch malformed input before you spend a third-party API call:

```ts
import {
  validateUSCC,        // China — 18-char Unified Social Credit Code with check digit
  validateMST,         // Vietnam — 10-digit Mã số thuế (+ optional branch suffix)
  validateSSM,         // Malaysia — 6–12 digit SSM
  validateABN,         // Australia — 11-digit ABN with mod-89 check
  validateNIB,         // Indonesia — 13-digit Nomor Induk Berusaha
  validateRegistrationNumber,  // dispatcher by country
} from '@caistech/business-registry';

const v = validateUSCC('91440300MA5DJYNF8L');
// { valid: true, parsed: { registration_authority: '9', ... } }
```

The USCC validator implements GB 32100-2015 including the modulus-31 check digit.

## Providers

### Stub provider (any country)

Format-validates the registration number and returns `error.code='NOT_IMPLEMENTED'`. Use in dev or when no third-party API key is available. Importantly, gates checking the result will see `found=false` and fail-safe to HOLD rather than auto-PASS.

```ts
import { createStubProvider } from '@caistech/business-registry';

const cn = createStubProvider('CN');
const result = await cn.lookup({
  country: 'CN',
  registrationNumber: '91440300MA5DJYNF8L',
});
// result.found === false
// result.error.code === 'NOT_IMPLEMENTED'
// (gate will HOLD pending manual verification)
```

### Tianyancha provider (China)

Wraps Tianyancha's open API. Tianyancha is the most widely-used third-party wrapper around China's NECIPS (国家企业信用信息公示系统). Direct NECIPS scraping is not viable — this is the standard route.

```ts
import { createTianyanchaProvider } from '@caistech/business-registry';

const cn = createTianyanchaProvider({ apiToken: process.env.TIANYANCHA_API_TOKEN! });
const result = await cn.lookup({
  country: 'CN',
  registrationNumber: '91440300MA5DJYNF8L',
  legalName: '深圳市某某模块化建筑有限公司',
});
// result.found === true
// result.matched.legal_name_native === '深圳市...'
// result.matched.status === 'active'
// result.matched.name_match_score === 1
```

API docs: https://open.tianyancha.com/

### Vietnam / Malaysia

Stub providers only. Live providers can be added without changing the consumer interface — the registry orchestrator dispatches by country.

Recommended live data sources (TODO):
- Vietnam: https://dichvuthongtin.dkkd.gov.vn/ (no public API; commercial wrappers exist)
- Malaysia: https://www.ssm-einfo.my/ (paid API)

## Multi-country orchestrator

```ts
import {
  createRegistry,
  createTianyanchaProvider,
  createStubProvider,
} from '@caistech/business-registry';

const registry = createRegistry([
  createTianyanchaProvider({ apiToken: process.env.TIANYANCHA_API_TOKEN! }),
  createStubProvider('VN'),
  createStubProvider('MY'),
]);

// Dispatches to the right provider based on country
const cnResult = await registry.lookup({ country: 'CN', registrationNumber: '...' });
const vnResult = await registry.lookup({ country: 'VN', registrationNumber: '...' });

registry.hasProvider('TH'); // false → caller decides what to do
```

## Result schema

`BusinessLookupResult` — see `src/types.ts`. Key fields:

- `found: boolean` — true only when the registry confirmed the record
- `matched.status: RegistryStatus` — `'active' | 'inactive' | 'deregistered' | 'in_liquidation' | 'abnormal' | 'suspended' | 'unknown'`
- `matched.name_match_score: number | null` — 0–1 string-similarity score between request `legalName` and registry name (when `legalName` was provided)
- `error.code` — `'PROVIDER_UNAVAILABLE' | 'AUTH_FAILED' | 'RATE_LIMITED' | 'NOT_IMPLEMENTED' | 'INVALID_FORMAT'`
- `source.provider`, `source.queried_at` — for audit trail

## Gate logic recipe (for F2K CMPP G1)

```ts
const result = await registry.lookup({ country, registrationNumber, legalName });

if (result.error?.code === 'INVALID_FORMAT') return 'NO-GO';        // malformed
if (result.error?.code === 'NOT_IMPLEMENTED') return 'HOLD';        // no live provider
if (result.error?.code === 'PROVIDER_UNAVAILABLE') return 'HOLD';   // retry later
if (result.error?.code === 'AUTH_FAILED') return 'HOLD';            // ops issue
if (!result.found) return 'NO-GO';                                  // not in registry
if (result.matched!.status === 'deregistered') return 'NO-GO';
if (result.matched!.status === 'abnormal') return 'NO-GO';
if (result.matched!.status === 'in_liquidation') return 'NO-GO';
if ((result.matched!.name_match_score ?? 0) < 0.5) return 'HOLD';   // claimed name mismatches registry
return 'PASS';
```

## Versioning

Pre-1.0 — break freely.
