import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { FastifyRequest } from 'fastify';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const { method, url } = request;

    // Omitir logs de health checks
    if (url.includes('/health')) {
      return next.handle();
    }

    const requestId =
      (request.headers['x-request-id'] as string) ?? crypto.randomUUID();
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = context.switchToHttp().getResponse().statusCode;
          const duration = Date.now() - startTime;

          this.logger.log(
            JSON.stringify({
              level: 'info',
              event: 'HTTP_REQUEST',
              method,
              url,
              statusCode,
              duration: `${duration}ms`,
              requestId,
              timestamp: new Date().toISOString(),
            }),
          );
        },
        error: () => {
          const duration = Date.now() - startTime;

          this.logger.warn(
            JSON.stringify({
              level: 'warn',
              event: 'HTTP_REQUEST_FAILED',
              method,
              url,
              duration: `${duration}ms`,
              requestId,
              timestamp: new Date().toISOString(),
            }),
          );
        },
      }),
    );
  }
}
