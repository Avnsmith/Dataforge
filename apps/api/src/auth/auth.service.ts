import { Injectable, BadRequestException } from '@nestjs/common';
import { prisma, User } from '@dataforge/db';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Validates the wallet address (ensuring it matches Aptos format) and returns/creates the User, plus a JWT token.
   */
  async loginWithWallet(walletAddress: string, signature?: string, message?: string): Promise<{ user: User; token: string }> {
    if (!walletAddress) {
      throw new BadRequestException('Wallet address is required');
    }

    // Enforce Aptos wallet address format: 0x + exactly 64 hex characters (66 chars total)
    const hexRegex = /^0x[a-fA-F0-9]{64}$/;
    if (!hexRegex.test(walletAddress)) {
      throw new BadRequestException('Invalid wallet address format. Must be 0x followed by exactly 64 hex characters (Aptos format).');
    }

    // Standardize to lowercase
    const normalizedAddress = walletAddress.toLowerCase();

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
    });

    if (!user) {
      // Create user with a generated username
      const shortAddress = normalizedAddress.substring(2, 8);
      let username = `user_${shortAddress}`;

      // Check if username is already taken to prevent Prisma constraint errors
      const existingUserByUsername = await prisma.user.findUnique({
        where: { username },
      });
      if (existingUserByUsername) {
        username = `user_${shortAddress}_${Math.floor(Math.random() * 10000)}`;
      }

      const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${normalizedAddress}`;

      user = await prisma.user.create({
        data: {
          walletAddress: normalizedAddress,
          username,
          avatarUrl,
        },
      });
    }

    const token = this.jwtService.sign({
      sub: user.id,
      walletAddress: user.walletAddress,
      username: user.username,
    });

    return { user, token };
  }

  async verifyToken(token: string): Promise<any> {
    try {
      return this.jwtService.verify(token);
    } catch (e) {
      return null;
    }
  }

  async getCurrentUser(walletAddress: string): Promise<User | null> {
    if (!walletAddress) return null;
    return prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() },
    });
  }
}
