import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { prisma, User } from '@dataforge/db';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Ed25519PublicKey, Ed25519Signature, AuthenticationKey } from '@aptos-labs/ts-sdk';
import Redis from 'ioredis';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly redis: Redis | null = null;
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      try {
        const tls = redisUrl.startsWith('rediss://') ? {} : undefined;
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          tls,
        });
        this.redis.on('error', (err) => {
          this.logger.warn(`Redis connection error in AuthService: ${err.message}. Falling back to PostgreSQL for nonces.`);
        });
      } catch (e: any) {
        this.logger.warn(`Failed to initialize Redis client in AuthService: ${e.message}. Falling back to PostgreSQL.`);
      }
    }
  }

  /**
   * Generates a random one-time nonce for signature verification, expiring in 5 minutes.
   * Stores it in Redis (preferred) or PostgreSQL (fallback).
   */
  async generateNonce(walletAddress: string, ip = '127.0.0.1', userAgent = 'unknown'): Promise<string> {
    console.log("[BACKEND TRACE] generateNonce Service Entered");
    console.log("walletAddress:", walletAddress);
    try {
      if (!walletAddress) {
        console.log("Validation: walletAddress missing");
        throw new BadRequestException('Wallet address is required');
      }

      const hexRegex = /^0x[a-fA-F0-9]{64}$/;
      const validationResult = hexRegex.test(walletAddress);
      console.log("validation result for raw address:", validationResult);

      if (!validationResult) {
        console.log("Validation Failed: invalid wallet address format");
        throw new BadRequestException('Invalid wallet address format. Must be 0x followed by exactly 64 hex characters (Aptos format).');
      }

      const normalizedAddress = walletAddress.toLowerCase();
      console.log("normalizedAddress:", normalizedAddress);

      const nonce = crypto.randomBytes(16).toString('hex');
      console.log("generated nonce:", nonce);

      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000); // 5 mins

      const nonceObj = {
        walletAddress: normalizedAddress,
        nonce,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ip,
        userAgent,
        used: false,
      };

      let redisSuccess = false;
      console.log("redis status (exists):", !!this.redis);
      if (this.redis) {
        try {
          const key = `auth:nonce:${normalizedAddress}`;
          console.log("Setting nonce in Redis key:", key);
          await this.redis.set(key, JSON.stringify(nonceObj), 'EX', 300); // 5 mins
          console.log("Redis status: set successful");
          redisSuccess = true;
        } catch (e: any) {
          console.warn(`Redis set failed: ${e.message}. Falling back to Postgres.`);
        }
      }

      if (!redisSuccess) {
        console.log("database status: inserting nonce into Postgres AuthNonce table...");
        const dbResult = await prisma.authNonce.create({
          data: {
            walletAddress: normalizedAddress,
            nonce,
            expiresAt,
            ip,
            userAgent,
          },
        });
        console.log("database status: insert successful, row id:", dbResult.id || '(no id)');
      }

      return nonce;
    } catch (err: any) {
      console.error("[BACKEND TRACE] Exception in generateNonce Service:");
      console.error("err.name:", err.name);
      console.error("err.message:", err.message);
      console.error("err.stack:", err.stack);
      console.error("err.cause:", err.cause);
      throw err;
    }
  }

  /**
   * Cryptographically verifies the signature against the nonce and public key.
   */
  async verifySignature(
    walletAddress: string,
    publicKey: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    const normalizedAddress = walletAddress.toLowerCase();

    // 1. Extract nonce from the signed message string
    const nonceMatch = message.match(/Nonce:\s*([a-fA-F0-9]{32})/i);
    if (!nonceMatch) {
      throw new BadRequestException('Message does not contain a valid nonce format');
    }
    const nonce = nonceMatch[1];

    // 2. Verify that public key derives to the expected account address (prevents address spoofing)
    try {
      const pubKey = new Ed25519PublicKey(publicKey);
      const authKey = AuthenticationKey.fromPublicKey({ publicKey: pubKey });
      const derivedAddress = authKey.derivedAddress().toString();
      if (derivedAddress.toLowerCase() !== normalizedAddress) {
        throw new BadRequestException('Public key does not match the provided wallet address');
      }
    } catch (e: any) {
      throw new BadRequestException(`Invalid public key: ${e.message}`);
    }

    // 3. Fetch nonce from Redis or Postgres
    let nonceData: any = null;
    let fromRedis = false;

    if (this.redis) {
      try {
        const key = `auth:nonce:${normalizedAddress}`;
        const raw = await this.redis.get(key);
        if (raw) {
          nonceData = JSON.parse(raw);
          fromRedis = true;
        }
      } catch (e: any) {
        this.logger.warn(`Redis get failed: ${e.message}. Trying Postgres fallback.`);
      }
    }

    if (!nonceData) {
      nonceData = await prisma.authNonce.findUnique({
        where: { nonce },
      });
    }

    if (!nonceData) {
      throw new BadRequestException('Nonce not found or already consumed');
    }

    if (nonceData.used) {
      throw new BadRequestException('Nonce has already been used');
    }

    const expiresAt = new Date(nonceData.expiresAt);
    if (new Date() > expiresAt) {
      throw new BadRequestException('Nonce has expired');
    }

    if (nonceData.walletAddress.toLowerCase() !== normalizedAddress) {
      throw new BadRequestException('Nonce does not match the requested wallet address');
    }

    if (nonceData.nonce !== nonce) {
      throw new BadRequestException('Nonce mismatch');
    }

    // 4. Cryptographically verify signature using the verified public key
    try {
      const pubKey = new Ed25519PublicKey(publicKey);
      const sig = new Ed25519Signature(signature);
      const isValid = pubKey.verifySignature({
        message,
        signature: sig,
      });
      if (!isValid) {
        throw new BadRequestException('Cryptographic signature verification failed');
      }
    } catch (e: any) {
      throw new BadRequestException(`Signature verification failed: ${e.message}`);
    }

    // 5. Consume/invalidate the nonce immediately after successful verification
    if (fromRedis && this.redis) {
      try {
        const key = `auth:nonce:${normalizedAddress}`;
        await this.redis.del(key);
      } catch (e: any) {
        this.logger.warn(`Redis del failed: ${e.message}`);
      }
    } else {
      await prisma.authNonce.update({
        where: { nonce },
        data: { used: true },
      });
    }

    return true;
  }

  /**
   * Logs in a user by verifying signature and returning a JWT token and user info.
   */
  async loginWithWalletSignature(
    walletAddress: string,
    publicKey: string,
    signature: string,
    message: string
  ): Promise<{ user: User; token: string }> {
    // Perform cryptographic verification
    await this.verifySignature(walletAddress, publicKey, signature, message);

    const normalizedAddress = walletAddress.toLowerCase();

    // Fetch or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
    });

    if (!user) {
      const shortAddress = normalizedAddress.substring(2, 8);
      let username = `user_${shortAddress}`;

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

    const token = this.jwtService.sign(
      {
        sub: user.id,
        walletAddress: user.walletAddress,
        publicKey,
      },
      {
        jwtid: crypto.randomUUID(),
      }
    );

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
