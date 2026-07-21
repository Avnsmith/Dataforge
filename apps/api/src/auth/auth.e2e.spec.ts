import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { BadRequestException } from '@nestjs/common';
import { prisma } from '@dataforge/db';

describe('Auth Cryptographic Signature E2E Integration', () => {
  let authService: AuthService;
  let authController: AuthController;

  const mockRes = {
    cookie: jest.fn(),
  } as any;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: 'test-secret-key-1234567890abcdef' }),
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'REDIS_URL') return ''; // Use PostgreSQL fallback for nonces
              if (key === 'AUTH_MODE') return 'wallet';
              return '';
            }),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    authController = module.get<AuthController>(AuthController);
  });

  afterAll(async () => {
    // Clean up nonces generated during tests
    await prisma.authNonce.deleteMany({
      where: {
        walletAddress: {
          contains: '0x',
        },
      },
    }).catch(() => {});
  });

  it('should successfully run through the full cryptographic handshake with a real Aptos keypair', async () => {
    // 1. Generate real Ed25519 keypair
    const privateKey = Ed25519PrivateKey.generate();
    const account = Account.fromPrivateKey({ privateKey });
    const walletAddress = account.accountAddress.toString();
    const publicKey = account.publicKey.toString();

    // 2. Request Nonce
    const nonce = await authService.generateNonce(walletAddress);
    expect(nonce).toBeDefined();
    expect(nonce.length).toBe(32); // 16 bytes hex

    // 3. Build and Sign message
    const timestamp = Date.now();
    const message = `DataForge Login\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
    const messageBytes = new TextEncoder().encode(message);
    const signatureObj = account.sign(messageBytes);
    const signature = signatureObj.toString();

    // 4. Verify signature on backend
    const loginResult = await authController.authWallet({
      walletAddress,
      publicKey,
      signature,
      message,
    });

    expect(loginResult.token).toBeDefined();
    expect(loginResult.user).toBeDefined();
    expect(loginResult.user.walletAddress).toBe(walletAddress.toLowerCase());

    // 5. Replay Attack Protection: verify using the same nonce fails
    await expect(
      authController.authWallet({
        walletAddress,
        publicKey,
        signature,
        message,
      })
    ).rejects.toThrow(BadRequestException);

    // 6. Wrong signature check: verify it fails
    const invalidSignature = '0x' + '0'.repeat(128);
    const newNonce = await authService.generateNonce(walletAddress);
    const newMessage = `DataForge Login\nNonce: ${newNonce}\nTimestamp: ${Date.now()}`;
    await expect(
      authController.authWallet({
        walletAddress,
        publicKey,
        signature: invalidSignature,
        message: newMessage,
      })
    ).rejects.toThrow(BadRequestException);

    // 7. Wrong address mismatch check: verify it fails
    const otherPrivateKey = Ed25519PrivateKey.generate();
    const otherAccount = Account.fromPrivateKey({ privateKey: otherPrivateKey });
    const otherAddress = otherAccount.accountAddress.toString();

    const anotherNonce = await authService.generateNonce(walletAddress);
    const anotherMessage = `DataForge Login\nNonce: ${anotherNonce}\nTimestamp: ${Date.now()}`;
    const anotherSig = account.sign(new TextEncoder().encode(anotherMessage)).toString();

    await expect(
      authController.authWallet({
        walletAddress: otherAddress,
        publicKey,
        signature: anotherSig,
        message: anotherMessage,
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject expired nonces', async () => {
    const privateKey = Ed25519PrivateKey.generate();
    const account = Account.fromPrivateKey({ privateKey });
    const walletAddress = account.accountAddress.toString();
    const publicKey = account.publicKey.toString();

    // Generate expired nonce in DB directly
    const nonce = 'expirednonce1234567890abcdef1234';
    await prisma.authNonce.create({
      data: {
        walletAddress: walletAddress.toLowerCase(),
        nonce,
        expiresAt: new Date(Date.now() - 1000), // 1 sec in the past
        ip: '127.0.0.1',
        userAgent: 'test',
      },
    });

    const message = `DataForge Login\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
    const signature = account.sign(new TextEncoder().encode(message)).toString();

    await expect(
      authController.authWallet({
        walletAddress,
        publicKey,
        signature,
        message,
      })
    ).rejects.toThrow(BadRequestException);
  });
});
