import { Controller, Post, Get, Body, Headers, UnauthorizedException, HttpCode, HttpStatus, Req, BadRequestException, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RequestNonceDto } from './dto/nonce.dto';
import { VerifySignatureDto } from './dto/verify.dto';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // Nonce generation endpoint — 10 requests per minute brute-force protection
  @Post('nonce')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getNonce(
    @Body() body: RequestNonceDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    const nonce = await this.authService.generateNonce(body.walletAddress, ip, userAgent);
    return { nonce };
  }

  // Cryptographic verification endpoint
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifySignature(
    @Body() body: VerifySignatureDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.authService.loginWithWalletSignature(
      body.walletAddress,
      body.publicKey,
      body.signature,
      body.message,
    );

    const isProdOrStaging = this.configService.get<string>('NODE_ENV') === 'production' ||
      this.configService.get<string>('NODE_ENV') === 'staging';

    res.cookie('df_token', token, {
      httpOnly: true,
      secure: isProdOrStaging,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return { user, token };
  }

  // Legacy/mock wallet endpoint — kept for backward compatibility and fallback
  @Post('wallet')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async authWallet(
    @Body() body: { walletAddress: string; publicKey?: string; signature?: string; message?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const authMode = this.configService.get<string>('AUTH_MODE') || 'mock';
    let authResult: { user: any; token: string };

    if (authMode === 'wallet') {
      if (!body.signature || !body.publicKey || !body.message) {
        throw new BadRequestException('AUTH_MODE=wallet requires publicKey, signature, and message.');
      }
      authResult = await this.authService.loginWithWalletSignature(
        body.walletAddress,
        body.publicKey,
        body.signature,
        body.message
      );
    } else {
      authResult = await this.authService.loginWithWalletMock(body.walletAddress);
    }

    const isProdOrStaging = this.configService.get<string>('NODE_ENV') === 'production' ||
      this.configService.get<string>('NODE_ENV') === 'staging';

    res.cookie('df_token', authResult.token, {
      httpOnly: true,
      secure: isProdOrStaging,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return authResult;
  }

  @Get('session')
  @UseGuards(AuthGuard)
  async getSession(@Req() req: any) {
    const user = await this.authService.getCurrentUser(req.user.walletAddress);
    if (!user) {
      throw new UnauthorizedException('User session not found');
    }
    return { user };
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
