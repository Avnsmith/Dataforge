import { IsString, Matches } from 'class-validator';

export class RequestNonceDto {
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'Invalid wallet address format. Must be 0x followed by exactly 64 hex characters (Aptos format).',
  })
  walletAddress!: string;
}
