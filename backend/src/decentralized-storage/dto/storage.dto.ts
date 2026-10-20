import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UploadMediaDto {
  @ApiProperty() @IsString() eventId: string;
  @ApiProperty() @IsString() fileName: string;
  @ApiProperty() @IsString() mimeType: string;
  @ApiProperty() @IsString() content: string;
}
export class PinMediaDto {
  @ApiProperty() @IsString() eventId: string;
  @ApiProperty() @IsString() hash: string;
}

export class PinToIpfsDto {
  @ApiProperty({ description: 'Event ID this asset belongs to' })
  @IsString()
  eventId: string;

  @ApiProperty({ description: 'File name of the asset' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: 'MIME type of the asset' })
  @IsString()
  mimeType: string;

  @ApiProperty({ description: 'Content to pin (base64 or UTF-8 string)' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Whether to use redundant pinning services', default: true })
  @IsOptional()
  redundant?: boolean;
}

export class VerifyPinStatusDto {
  @ApiProperty({ description: 'IPFS content hash (CID) to verify' })
  @IsString()
  hash: string;
}

export class MigrateUnpinnedAssetsDto {
  @ApiProperty({ description: 'Event ID to migrate unpinned assets for' })
  @IsString()
  eventId: string;

  @ApiPropertyOptional({ description: 'Dry run only — report what would be pinned without actually pinning', default: false })
  @IsOptional()
  dryRun?: boolean;
}

export class PinToIpfsResponseDto {
  @ApiProperty()
  hash: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  eventId: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  pinned: boolean;

  @ApiProperty({ description: 'Number of pinning services that successfully pinned the content' })
  redundantPins: number;
}

export class PinStatusResponseDto {
  @ApiProperty()
  hash: string;

  @ApiProperty()
  isPinned: boolean;

  @ApiPropertyOptional()
  eventId?: string;

  @ApiPropertyOptional()
  url?: string;

  @ApiPropertyOptional()
  pinnedAt?: Date;

  @ApiProperty({ description: 'HTTP reachability status of the IPFS gateway URL' })
  gatewayReachable: boolean;
}

export class MigrateUnpinnedAssetsResponseDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty({ description: 'Total assets found for the event' })
  totalAssets: number;

  @ApiProperty({ description: 'Assets that were already pinned' })
  alreadyPinned: number;

  @ApiProperty({ description: 'Assets that were pinned during migration' })
  migrated: number;

  @ApiProperty({ description: 'Assets that failed to pin' })
  failed: number;

  @ApiProperty()
  dryRun: boolean;

  @ApiProperty({ type: [String], description: 'List of IPFS hashes that were (or would be) migrated' })
  migratedHashes: string[];
}
