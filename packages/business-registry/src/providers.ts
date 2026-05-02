/**
 * @caistech/business-registry — Built-in providers.
 *
 * Two flavours per country:
 *   - A "stub" provider that runs the format validator only and returns
 *     a NOT_IMPLEMENTED error indicating live registry lookup is unavailable.
 *     Use this in dev / when no third-party API key is provisioned.
 *   - A live provider that wraps a third-party API. For China this is
 *     Tianyancha (天眼查) — the most commonly used third-party wrapper of
 *     China's NECIPS data, which is not directly API-accessible.
 *
 * Stub providers still return findable=false with a clear error code so
 * gate evaluation can fail-safe (HOLD with "we couldn't verify your registry
 * record automatically" rather than auto-PASS).
 */

import type {
  BusinessLookupRequest,
  BusinessLookupResult,
  CountryCode,
  RegistryProvider,
} from './types';
import { validateRegistrationNumber } from './validators';

function buildStubResult(
  providerName: string,
  req: BusinessLookupRequest,
  warning: string,
): BusinessLookupResult {
  return {
    found: false,
    matched: null,
    source: { provider: providerName, queried_at: new Date().toISOString() },
    warnings: [warning],
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `Live registry lookup not configured for ${req.country}. Format-only validation passed; manual verification required.`,
    },
  };
}

function buildInvalidFormatResult(
  providerName: string,
  req: BusinessLookupRequest,
  reason: string,
): BusinessLookupResult {
  return {
    found: false,
    matched: null,
    source: { provider: providerName, queried_at: new Date().toISOString() },
    warnings: [],
    error: {
      code: 'INVALID_FORMAT',
      message: `Registration number format invalid for ${req.country}: ${reason}`,
    },
  };
}

/**
 * Generic stub provider — runs the format validator and stops there.
 */
export function createStubProvider(country: CountryCode): RegistryProvider {
  return {
    country,
    name: `${country.toLowerCase()}-stub`,
    async lookup(req) {
      const v = validateRegistrationNumber(country, req.registrationNumber);
      if (!v.valid) {
        return buildInvalidFormatResult(`${country.toLowerCase()}-stub`, req, v.reason ?? 'unknown');
      }
      return buildStubResult(
        `${country.toLowerCase()}-stub`,
        req,
        `Format validation passed; live lookup unavailable for ${country}.`,
      );
    },
  };
}

/**
 * China NECIPS via Tianyancha (天眼查) third-party API.
 *
 * Tianyancha is the most widely used wrapper of China's National Enterprise
 * Credit Information Publicity System (国家企业信用信息公示系统 / NECIPS).
 * Direct NECIPS scraping is fragile and ToS-questionable; Tianyancha provides
 * a paid REST API with stable schemas.
 *
 * API docs: https://open.tianyancha.com/
 *
 * Required env / config: TIANYANCHA_API_TOKEN (passed in as `apiToken`).
 *
 * Production note: Tianyancha's response schema includes more than is mapped
 * here. We extract only the fields needed for CMPP G1. Raw response should
 * be persisted separately for audit (`raw_response_ref` placeholder).
 */
export function createTianyanchaProvider(opts: { apiToken: string; baseUrl?: string }): RegistryProvider {
  const baseUrl = opts.baseUrl ?? 'https://open.api.tianyancha.com';
  return {
    country: 'CN',
    name: 'tianyancha',
    async lookup(req) {
      const v = validateRegistrationNumber('CN', req.registrationNumber);
      if (!v.valid) {
        return buildInvalidFormatResult('tianyancha', req, v.reason ?? 'unknown');
      }

      try {
        const url = new URL('/services/open/ic/baseinfo/2.0', baseUrl);
        url.searchParams.set('keyword', req.registrationNumber);

        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: { Authorization: opts.apiToken },
          signal: AbortSignal.timeout(15000),
        });

        if (res.status === 401 || res.status === 403) {
          return {
            found: false,
            matched: null,
            source: { provider: 'tianyancha', queried_at: new Date().toISOString() },
            warnings: [],
            error: { code: 'AUTH_FAILED', message: `Tianyancha auth failed (${res.status})` },
          };
        }
        if (res.status === 429) {
          return {
            found: false,
            matched: null,
            source: { provider: 'tianyancha', queried_at: new Date().toISOString() },
            warnings: [],
            error: { code: 'RATE_LIMITED', message: 'Tianyancha rate limit exceeded' },
          };
        }
        if (!res.ok) {
          return {
            found: false,
            matched: null,
            source: { provider: 'tianyancha', queried_at: new Date().toISOString() },
            warnings: [],
            error: { code: 'PROVIDER_UNAVAILABLE', message: `Tianyancha returned ${res.status}` },
          };
        }

        const body = (await res.json()) as TianyanchaResponse;

        // error_code 0 = success in TYC's convention
        if (body.error_code !== 0 || !body.result) {
          return {
            found: false,
            matched: null,
            source: { provider: 'tianyancha', queried_at: new Date().toISOString() },
            warnings: [body.reason ?? 'No record returned'],
          };
        }

        const r = body.result;
        const status = mapTycStatus(r.regStatus);
        const nameMatch =
          req.legalName && r.name ? scoreNameMatch(req.legalName, r.name, r.alias) : null;

        return {
          found: true,
          matched: {
            legal_name: r.name ?? '',
            legal_name_native: r.name ?? null,
            registration_number: r.creditCode ?? req.registrationNumber,
            status,
            established_date: r.estiblishTime ? toIsoDate(r.estiblishTime) : null,
            registered_address: r.regLocation ?? null,
            business_scope: r.businessScope ?? null,
            legal_representative: r.legalPersonName ?? null,
            registered_capital: r.regCapital
              ? parseRegCapital(r.regCapital)
              : null,
            name_match_score: nameMatch,
          },
          source: { provider: 'tianyancha', queried_at: new Date().toISOString() },
          warnings: status === 'unknown' ? [`Tianyancha status '${r.regStatus}' did not map to known states`] : [],
        };
      } catch (err) {
        return {
          found: false,
          matched: null,
          source: { provider: 'tianyancha', queried_at: new Date().toISOString() },
          warnings: [],
          error: {
            code: 'PROVIDER_UNAVAILABLE',
            message: `Tianyancha fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    },
  };
}

interface TianyanchaResponse {
  error_code: number;
  reason?: string;
  result?: {
    name?: string;
    alias?: string;
    creditCode?: string;
    regStatus?: string;
    estiblishTime?: string | number;
    regLocation?: string;
    businessScope?: string;
    legalPersonName?: string;
    regCapital?: string;
  };
}

function mapTycStatus(raw?: string): import('./types').RegistryStatus {
  if (!raw) return 'unknown';
  const r = raw.toLowerCase();
  if (r.includes('存续') || r.includes('在营') || r.includes('开业')) return 'active';
  if (r.includes('注销')) return 'deregistered';
  if (r.includes('清算')) return 'in_liquidation';
  if (r.includes('吊销') || r.includes('异常')) return 'abnormal';
  if (r.includes('迁出') || r.includes('停业')) return 'inactive';
  return 'unknown';
}

function toIsoDate(raw: string | number): string | null {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseRegCapital(raw: string): { amount: number; currency: string } | null {
  const m = raw.match(/([\d.]+)\s*([一-鿿]+|\w+)?/);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  if (Number.isNaN(amount)) return null;
  const unit = m[2] ?? '';
  let currency = 'CNY';
  if (unit.includes('美元') || unit.toUpperCase().includes('USD')) currency = 'USD';
  else if (unit.includes('港元') || unit.toUpperCase().includes('HKD')) currency = 'HKD';
  return { amount, currency };
}

/**
 * Cheap normalised-substring + token-overlap name match. Returns 0–1.
 * Conservative — false positives are worse than false negatives here.
 */
function scoreNameMatch(claimed: string, registry: string, alias?: string): number {
  const norm = (s: string) => s.replace(/[（）()【】\[\]\s]/g, '').toLowerCase();
  const c = norm(claimed);
  const r = norm(registry);
  if (c === r) return 1;
  if (alias && norm(alias) === c) return 1;
  if (r.includes(c) || c.includes(r)) return 0.8;
  // token overlap fallback
  const tokens = (s: string) => new Set(s.split(/[、，,。.\s]+/).filter((t) => t.length >= 2));
  const cTok = tokens(claimed);
  const rTok = tokens(registry);
  const intersection = [...cTok].filter((t) => rTok.has(t)).length;
  const union = new Set([...cTok, ...rTok]).size;
  return union === 0 ? 0 : intersection / union;
}
