import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { jwtVerify } from 'jose';
import type { Request } from 'express';

const secret = new TextEncoder().encode(process.env.INTERNAL_API_SECRET);

// Verifies the short-lived JWT that web/ mints for every server-side
// call. This is the trust boundary: Finance API never accepts a
// caller-supplied userId directly (brief §12 — "never trust a userId
// sent by the browser"), only one signed with a secret only web/'s
// server-side code holds, with an expiry short enough that a captured
// token is useless by the time it could be replayed.
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
      const { payload } = await jwtVerify(token, secret);
      request.userId = Number(payload.sub);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired internal auth token');
    }
  }
}
