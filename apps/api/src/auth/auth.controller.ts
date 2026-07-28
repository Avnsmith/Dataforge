import { Controller, Post, Get, Body, Headers, UnauthorizedException, HttpCode, HttpStatus, Req, BadRequestException, UseGuards } from '@nestjs/common';
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
    console.log("[BACKEND TRACE] getNonce Controller Entered");
    console.log("Input body.walletAddress:", body.walletAddress);
    try {
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'unknown';
      console.log("IP:", ip, "UserAgent:", userAgent);
      
      const nonce = await this.authService.generateNonce(body.walletAddress, ip, userAgent);
      console.log("Generated nonce from service:", nonce);
      return { nonce };
    } catch (err: any) {
      console.error("[BACKEND TRACE] Exception in getNonce Controller:");
      console.error("err.name:", err.name);
      console.error("err.message:", err.message);
      console.error("err.stack:", err.stack);
      console.error("err.cause:", err.cause);
      throw err;
    }
  }

  // Cryptographic verification endpoint
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifySignature(
    @Body() body: VerifySignatureDto,
  ) {
    const { user, token } = await this.authService.loginWithWalletSignature(
      body.walletAddress,
      body.publicKey,
      body.signature,
      body.message,
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
