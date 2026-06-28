/**
 * DataForge AI — Structured Request Logging Interceptor
 *
 * Logs every HTTP request with:
 * - requestId (from x-request-id header)
 * - method, path, status code, latency
 * - userId / wallet address if authenticated
 *
 * Uses NestJS Logger (structured output compatible with JSON logging).
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = Date.now();

    const method = req.method;
    const url = req.url;
    const requestId = req.requestId || req.headers?.['x-request-id'] || '-';
    const userId = req.user?.walletAddress
      ? req.user.walletAddress.slice(0, 10) + '...'
      : 'anonymous';

    return next.handle().pipe(
      tap(() => {
        const latency = Date.now() - start;
        const statusCode = res.statusCode;
        this.logger.log(
          `${method} ${url} ${statusCode} ${latency}ms | requestId=${requestId} user=${userId}`
        );
      }),
      catchError((err) => {
        const latency = Date.now() - start;
        const statusCode = err.status || 500;
        const stackStr = err.stack ? `\n${err.stack}` : '';
        if (statusCode >= 500) {
          this.logger.error(
            `${method} ${url} ${statusCode} ${latency}ms | requestId=${requestId} user=${userId} error=${err.message}${stackStr}`
          );
        } else {
          this.logger.warn(
            `${method} ${url} ${statusCode} ${latency}ms | requestId=${requestId} user=${userId} error=${err.message}`
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
