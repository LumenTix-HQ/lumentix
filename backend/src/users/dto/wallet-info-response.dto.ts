import { ApiProperty } from '@nestjs/swagger';

export class WalletInfoResponseDto {
  @ApiProperty({
    example: 'GABC...XYZ',
    nullable: true,
    description:
      'The Stellar public key linked to this account, or null if no wallet is linked.',
  })
  stellarPublicKey: string | null;

  @ApiProperty({ example: true })
  hasLinkedWallet: boolean;
}
