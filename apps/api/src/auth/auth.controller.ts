import { Controller, Post, Get, Body, Headers, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 10 requests per minute — brute-force protection
  @Post('wallet')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async authWallet(
    @Body() body: { walletAddress: string; signature?: string; message?: string }
  ) {
    const { user, token } = await this.authService.loginWithWallet(
      body.walletAddress,
      body.signature,
      body.message
    );
    return { user, token };
  }

  @Get('me')
  async getMe(@Headers('x-wallet-address') walletAddress?: string) {
    if (!walletAddress) {
      throw new UnauthorizedException('No wallet address header provided');
    }

    const user = await this.authService.getCurrentUser(walletAddress);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { user };
  }
}
