import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    let token = request.cookies?.df_token;

    if (!token && request.headers.authorization) {
      const [type, headerToken] = request.headers.authorization.split(' ');
      if (type === 'Bearer' && headerToken) {
        token = headerToken;
      }
    }

    if (!token) {
      throw new UnauthorizedException('Missing authentication token (cookie or Bearer header)');
    }

    const decoded = await this.authService.verifyToken(token);
    if (!decoded) {
      throw new UnauthorizedException('Invalid or expired authentication session');
    }

    // Attach user profile metadata to the request
    request.user = {
      id: decoded.sub,
      walletAddress: decoded.walletAddress,
      username: decoded.username,
    };

    return true;
  }
}
