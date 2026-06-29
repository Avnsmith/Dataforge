import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

jest.mock('@dataforge/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'mock-user-uuid',
        walletAddress: '0x1111111111111111111111111111111111111111111111111111111111111111',
        username: 'testuser',
      }),
    },
    authNonce: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@aptos-labs/ts-sdk', () => {
  return {
    Ed25519PublicKey: jest.fn().mockImplementation((hex) => {
      if (hex === '0xinvalidpubkey') {
        throw new Error('Invalid public key hex format');
      }
      return {
        hex,
        verifySignature: jest.fn().mockImplementation(({ message, signature }) => {
          if (signature.hex === '0xinvalidsig') return false;
          return true;
        }),
      };
    }),
    Ed25519Signature: jest.fn().mockImplementation((hex) => {
      return { hex };
    }),
    AuthenticationKey: {
      fromPublicKey: jest.fn().mockImplementation(({ publicKey }) => {
        return {
          derivedAddress: () => ({
            toString: () => {
              if (publicKey.hex === '0xwrongpubkey') {
                return '0x2222222222222222222222222222222222222222222222222222222222222222';
              }
              return '0x1111111111111111111111111111111111111111111111111111111111111111';
            },
          }),
        };
      }),
    },
  };
});

import { prisma } from '@dataforge/db';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-bearer-token-xyz'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'REDIS_URL') return ''; // force DB fallback
              return '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should validate and register a mock Aptos wallet address (Mock Mode fallback)', async () => {
    const walletAddress = '0x1111111111111111111111111111111111111111111111111111111111111111';
    
    const result = await service.loginWithWalletMock(walletAddress);
    
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletAddress: walletAddress.toLowerCase(),
      }),
    });
    
    expect(result).toEqual({
      token: 'mock-bearer-token-xyz',
      user: expect.objectContaining({
        id: 'mock-user-uuid',
        walletAddress: walletAddress,
      }),
    });
  });

  describe('verifySignature and nonces', () => {
    const walletAddress = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const mockNonce = 'abcdefabcdefabcdefabcdefabcdefab';
    const mockMessage = `DataForge Login\nNonce: ${mockNonce}\nTimestamp: 12345`;
    const mockPublicKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const mockSignature = '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

    it('should generate a nonce and store it in database', async () => {
      jest.spyOn(prisma.authNonce, 'create').mockResolvedValue({} as any);
      
      const nonce = await service.generateNonce(walletAddress);
      expect(nonce).toBeDefined();
      expect(prisma.authNonce.create).toHaveBeenCalled();
    });

    it('should verify a valid cryptographic signature successfully', async () => {
      const expiresAt = new Date(Date.now() + 5000);
      jest.spyOn(prisma.authNonce, 'findUnique').mockResolvedValue({
        walletAddress: walletAddress.toLowerCase(),
        nonce: mockNonce,
        expiresAt,
        used: false,
      } as any);
      jest.spyOn(prisma.authNonce, 'update').mockResolvedValue({} as any);

      const isValid = await service.verifySignature(walletAddress, mockPublicKey, mockSignature, mockMessage);
      expect(isValid).toBe(true);
      expect(prisma.authNonce.update).toHaveBeenCalledWith({
        where: { nonce: mockNonce },
        data: { used: true },
      });
    });

    it('should fail if public key does not derive to walletAddress', async () => {
      const wrongPublicKey = '0xwrongpubkey';
      await expect(
        service.verifySignature(walletAddress, wrongPublicKey, mockSignature, mockMessage)
      ).rejects.toThrow(BadRequestException);
    });

    it('should fail if signature is invalid', async () => {
      const invalidSignature = '0xinvalidsig';
      const expiresAt = new Date(Date.now() + 5000);
      jest.spyOn(prisma.authNonce, 'findUnique').mockResolvedValue({
        walletAddress: walletAddress.toLowerCase(),
        nonce: mockNonce,
        expiresAt,
        used: false,
      } as any);

      await expect(
        service.verifySignature(walletAddress, mockPublicKey, invalidSignature, mockMessage)
      ).rejects.toThrow(BadRequestException);
    });

    it('should fail if nonce is expired', async () => {
      const expiredTime = new Date(Date.now() - 5000);
      jest.spyOn(prisma.authNonce, 'findUnique').mockResolvedValue({
        walletAddress: walletAddress.toLowerCase(),
        nonce: mockNonce,
        expiresAt: expiredTime,
        used: false,
      } as any);

      await expect(
        service.verifySignature(walletAddress, mockPublicKey, mockSignature, mockMessage)
      ).rejects.toThrow(BadRequestException);
    });

    it('should fail if nonce has already been used', async () => {
      const expiresAt = new Date(Date.now() + 5000);
      jest.spyOn(prisma.authNonce, 'findUnique').mockResolvedValue({
        walletAddress: walletAddress.toLowerCase(),
        nonce: mockNonce,
        expiresAt,
        used: true,
      } as any);

      await expect(
        service.verifySignature(walletAddress, mockPublicKey, mockSignature, mockMessage)
      ).rejects.toThrow(BadRequestException);
    });
  });
});
