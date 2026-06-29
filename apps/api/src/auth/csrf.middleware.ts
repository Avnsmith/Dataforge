import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const method = req.method;
    const path = req.path;

    // 1. Skip validation for safe HTTP methods
    const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method);

    const url = (req.originalUrl || req.url || '').toLowerCase();

    // 2. Skip validation for auth endpoints (nonce request and verify)
    const isAuthRoute = url.includes('/auth/nonce') ||
      url.includes('/auth/verify') ||
      url.includes('/auth/wallet');

    // Generate or rotate XSRF-TOKEN on GET requests to establish the session secret
    if (method === 'GET') {
      const existingToken = req.cookies?.['XSRF-TOKEN'];
      if (!existingToken) {
        const token = crypto.randomBytes(16).toString('hex');
        res.cookie('XSRF-TOKEN', token, {
          secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging',
          sameSite: 'lax',
          path: '/',
        });
      }
    }

    if (isSafeMethod || isAuthRoute) {
      return next();
    }

    // 3. Double Submit Cookie verification for modifying requests
    const cookieToken = req.cookies?.['XSRF-TOKEN'];
    const headerToken = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    next();
  }
}
