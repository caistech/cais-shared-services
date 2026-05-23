import { describe, it, expect } from 'vitest';
import { mintAnonSessionToken, verifyAnonSessionToken, hashToken } from '../src/session';

const SECRET = 'test-secret-please-rotate';

describe('anon session tokens', () => {
  it('mints a token that verifies back to its claims', () => {
    const { token, sid } = mintAnonSessionToken(SECRET, { agentId: 'agent_1' });
    const claims = verifyAnonSessionToken(SECRET, token);
    expect(claims).not.toBeNull();
    expect(claims!.sid).toBe(sid);
    expect(claims!.agentId).toBe('agent_1');
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = mintAnonSessionToken(SECRET, { agentId: 'agent_1' });
    expect(verifyAnonSessionToken('wrong-secret', token)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const { token } = mintAnonSessionToken(SECRET, { agentId: 'agent_1' });
    const [payload, sig] = token.split('.');
    const tampered = `${payload}x.${sig}`;
    expect(verifyAnonSessionToken(SECRET, tampered)).toBeNull();
  });

  it('rejects an expired token', () => {
    const { token } = mintAnonSessionToken(SECRET, { agentId: 'agent_1', ttlSeconds: -1 });
    expect(verifyAnonSessionToken(SECRET, token)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyAnonSessionToken(SECRET, '')).toBeNull();
    expect(verifyAnonSessionToken(SECRET, 'no-dot')).toBeNull();
    expect(verifyAnonSessionToken('', 'a.b')).toBeNull();
  });

  it('hashToken is stable and differs from the token', () => {
    const { token } = mintAnonSessionToken(SECRET, { agentId: 'agent_1' });
    const h1 = hashToken(token);
    const h2 = hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(token);
  });

  it('throws when minting without a secret', () => {
    expect(() => mintAnonSessionToken('', { agentId: 'a' })).toThrow();
  });
});
