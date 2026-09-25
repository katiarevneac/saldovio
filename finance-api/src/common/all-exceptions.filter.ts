import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

// Last line of defense (improvements.md S04.15): every intentional
// error path already throws a typed HttpException with its own message
// (ValidationPipe/ZodValidationPipe's 400s, NotFoundException,
// ForbiddenException, UnauthorizedException, etc.) — this filter only
// catches what nothing else caught, and converts it into a response that
// never leaks a stack trace, SQL fragment, or internal detail.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // improvements.md S04.16: Guards (e.g. InternalAuthGuard) run before
    // Interceptors in Nest's pipeline, so a guard-rejected request (401/403)
    // never reaches NoCacheInterceptor — this filter is every exception's
    // common choke point regardless of where it originated (guard, pipe, or
    // handler), so it's the right place to guarantee the header on those
    // responses too, not just the success path.
    response.setHeader('Cache-Control', 'private, no-store');

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(exception.getResponse());
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
