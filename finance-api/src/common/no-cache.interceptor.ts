import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';

// improvements.md S04.16: every response here is per-user financial
// data — a shared/misconfigured proxy or a browser's own disk cache
// must never serve one user's response to a later request on the same
// device (e.g. after logout, back-navigation on a shared computer).
@Injectable()
export class NoCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    return next.handle();
  }
}
