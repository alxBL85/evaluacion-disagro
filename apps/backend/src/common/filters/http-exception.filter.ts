import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
  requestId: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.resolveMessage(exception);
    const error = this.resolveErrorName(statusCode);
    const requestId =
      (request.headers['x-request-id'] as string) ?? crypto.randomUUID();

    const body: ErrorResponse = {
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    };

    // Log estructurado — errores 5xx como error, 4xx como warn
    const logPayload = {
      ...body,
      method: request.method,
      userAgent: request.headers['user-agent'],
    };

    if (statusCode >= 500) {
      this.logger.error(
        JSON.stringify(logPayload),
        (exception as Error)?.stack,
      );
    } else {
      this.logger.warn(JSON.stringify(logPayload));
    }

    reply.status(statusCode).send(body);
  }

  private resolveMessage(exception: unknown): string | string[] {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (typeof response === 'string') return response;

      if (typeof response === 'object' && response !== null) {
        const res = response as Record<string, unknown>;
        if (Array.isArray(res['message'])) return res['message'] as string[];
        if (typeof res['message'] === 'string') return res['message'];
      }
    }

    if (exception instanceof Error) return exception.message;

    return 'Internal server error';
  }

  private resolveErrorName(statusCode: number): string {
    const names: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return names[statusCode] ?? 'Unknown Error';
  }
}
