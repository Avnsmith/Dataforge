import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization format. Must be Bearer <token>');
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
