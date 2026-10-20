import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DecentralizedStorageService } from './decentralized-storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  UploadMediaDto,
  PinMediaDto,
  PinToIpfsDto,
  VerifyPinStatusDto,
  MigrateUnpinnedAssetsDto,
  PinToIpfsResponseDto,
  PinStatusResponseDto,
  MigrateUnpinnedAssetsResponseDto,
} from './dto/storage.dto';

@ApiTags('Decentralized Storage')
@ApiBearerAuth()
@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
@ApiResponse({ status: 404, description: 'Stored media not found' })
export class DecentralizedStorageController {
  constructor(private readonly storageService: DecentralizedStorageService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload event media to decentralized storage' })
  @ApiResponse({ status: 201, description: 'Media uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid media payload' })
  @ApiResponse({ status: 422, description: 'Media upload failed' })
  uploadMedia(@Body() dto: UploadMediaDto) {
    return this.storageService.upload_media_to_decentralized_storage(dto.eventId, dto.fileName, dto.mimeType, dto.content);
  }

  @Post('pin')
  @ApiOperation({ summary: 'Pin event media in decentralized storage' })
  @ApiResponse({ status: 201, description: 'Media pinned' })
  @ApiResponse({ status: 400, description: 'Invalid media hash' })
  @ApiResponse({ status: 422, description: 'Media could not be pinned' })
  pinMedia(@Body() dto: PinMediaDto) {
    return this.storageService.pin_event_media(dto.eventId, dto.hash);
  }

  @Get('retrieve/:hash')
  @ApiOperation({ summary: 'Retrieve decentralized media by hash' })
  @ApiResponse({ status: 200, description: 'Stored media returned' })
  retrieveMedia(@Param('hash') hash: string) {
    return this.storageService.retrieve_media_by_hash(hash);
  }

  @Post('pin-to-ipfs')
  @ApiOperation({ summary: 'Pin event media assets to IPFS with optional redundant pinning' })
  @ApiResponse({ status: 201, description: 'Asset pinned to IPFS', type: PinToIpfsResponseDto })
  @ApiResponse({ status: 400, description: 'IPFS not configured or invalid payload' })
  pinToIpfs(@Body() dto: PinToIpfsDto): Promise<PinToIpfsResponseDto> {
    return this.storageService.pin_to_ipfs(dto);
  }

  @Get('verify-pin/:hash')
  @ApiOperation({ summary: 'Verify whether an IPFS hash is currently pinned and accessible' })
  @ApiResponse({ status: 200, description: 'Pin status returned', type: PinStatusResponseDto })
  verifyPinStatus(@Param('hash') hash: string): Promise<PinStatusResponseDto> {
    return this.storageService.verify_pin_status(hash);
  }

  @Post('migrate-unpinned')
  @ApiOperation({ summary: 'Scan for unpinned event assets and migrate them to IPFS pinning' })
  @ApiResponse({ status: 201, description: 'Migration complete', type: MigrateUnpinnedAssetsResponseDto })
  @ApiResponse({ status: 400, description: 'IPFS not configured' })
  migrateUnpinnedAssets(
    @Body() dto: MigrateUnpinnedAssetsDto,
  ): Promise<MigrateUnpinnedAssetsResponseDto> {
    return this.storageService.migrate_unpinned_assets(dto);
  }
}
