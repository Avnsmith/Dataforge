import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';

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
  },
}));

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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should validate and register a mock Aptos wallet address and return a JWT', async () => {
    const walletAddress = '0x1111111111111111111111111111111111111111111111111111111111111111';
    
    const result = await service.loginWithWallet(walletAddress);
    
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletAddress: walletAddress.toLowerCase(),
      }),
    });
    
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'mock-user-uuid',
      walletAddress: walletAddress.toLowerCase(),
      username: 'testuser',
    });
    
    expect(result).toEqual({
      token: 'mock-bearer-token-xyz',
      user: expect.objectContaining({
        id: 'mock-user-uuid',
        walletAddress: walletAddress,
      }),
    });
  });
});
