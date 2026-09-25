import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { jwtVerify } from 'jose';
import type { Request } from 'express';

const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);
const ISSUER = 'saldovio-web';
const AUDIENCE = 'saldovio-finance-api';

// Verifies the short-lived JWT that web/ mints for every server-side
// call. This is the trust boundary: Finance API never accepts a
// caller-supplied userId directly (brief §12 — "never trust a userId
// sent by the browser"), only one signed with a secret only web/'s
// server-side code holds, with an expiry short enough that a captured
// token is useless by the time it could be replayed. Hardened per
// improvements.md F11a: explicit algorithm allowlist, issuer/audience
// binding, and a positive-integer subject requirement — a correctly
// signed but wrongly-shaped token (missing sub, wrong iss/aud, or a
// non-positive sub) is rejected the same as a badly-signed one.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { userId?: number }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing internal auth token');
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        requiredClaims: ['sub', 'iss', 'aud'],
      });

      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        // Deliberately a plain Error, not UnauthorizedException: it must
        // fall through to the generic rejection below, the same as a bad
        // signature or expired token — a distinct message here would leak
        // *why* the token was rejected (design spec S04.2: "no distinct
        // error message that would leak why it failed").
        throw new Error('Invalid internal auth token subject');
      }

      request.userId = userId;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired internal auth token');
    }
  }
}
