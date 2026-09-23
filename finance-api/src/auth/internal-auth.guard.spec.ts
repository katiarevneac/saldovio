import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import type { ExecutionContext } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard.js';

// Matches web/lib/internal-auth.ts's signInternalToken exactly, plus
// optional iss/aud so the same helper can build both a correctly-shaped
// token and a token the guard SHOULD reject (improvements.md F11a).
async function signToken(options: {
  sub?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);
  let jwt = new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();
  if (options.sub !== undefined) jwt = jwt.setSubject(options.sub);
  if (options.issuer !== undefined) jwt = jwt.setIssuer(options.issuer);
  if (options.audience !== undefined) jwt = jwt.setAudience(options.audience);
  jwt = jwt.setExpirationTime(options.expiresIn ?? '30s');
  return jwt.sign(secret);
}

function contextWithBearerToken(token: string): ExecutionContext {
  const request = { headers: { authorization: `Bearer ${token}` } };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('InternalAuthGuard', () => {
  const guard = new InternalAuthGuard();

  it('accepts a correctly-shaped token (sanity check — everything below is a rejection case)', async () => {
    const token = await signToken({ sub: '1' });
    await expect(guard.canActivate(contextWithBearerToken(token))).resolves.toBe(true);
  });

  // improvements.md F11a (P0): the guard calls `jwtVerify(token, secret)`
  // with no options object (internal-auth.guard.ts:31) — no algorithms
  // allowlist, no issuer, no audience, and `Number(payload.sub)` on a
  // missing sub silently produces NaN rather than a rejection. A token
  // that is correctly signed but missing `sub` should never be treated as
  // authenticating any user.
  //
  // EXPECTED (once F11a is fixed): rejected with UnauthorizedException.
  // CURRENT (proves the finding): accepted, request.userId becomes NaN.
  it('F11a: accepts a correctly-signed token with no subject claim', async () => {
    const token = await signToken({});
    await expect(guard.canActivate(contextWithBearerToken(token))).rejects.toThrow();
  });

  // improvements.md F11a (P0): the guard never sets or checks `iss`/`aud`.
  // A token signed with the right secret but naming an unrelated issuer
  // and audience — i.e. not shaped like anything web/'s signer actually
  // produces — is accepted exactly the same as a real one.
  //
  // EXPECTED (once F11a is fixed): rejected, since the issuer/audience
  // don't match what the guard expects.
  // CURRENT (proves the finding): accepted — neither claim is checked.
  it('F11a: accepts a correctly-signed token with an unrelated issuer/audience', async () => {
    const token = await signToken({
      sub: '1',
      issuer: 'not-saldovio-web',
      audience: 'not-saldovio-finance-api',
    });
    await expect(guard.canActivate(contextWithBearerToken(token))).rejects.toThrow();
  });
});
