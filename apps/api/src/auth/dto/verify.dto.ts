import { IsString, Matches } from 'class-validator';

export class VerifySignatureDto {
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'Invalid wallet address format. Must be 0x followed by exactly 64 hex characters (Aptos format).',
  })
  walletAddress!: string;

  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'Invalid public key format. Must be 0x followed by exactly 64 hex characters.',
  })
  publicKey!: string;

  @IsString()
  @Matches(/^0x[a-fA-F0-9]{128}$/, {
    message: 'Invalid signature format. Must be 0x followed by exactly 128 hex characters.',
  })
  signature!: string;

  @IsString()
  message!: string;
}
