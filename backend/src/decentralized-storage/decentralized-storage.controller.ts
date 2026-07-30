import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DecentralizedStorageService } from './decentralized-storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadMediaDto, PinMediaDto } from './dto/storage.dto';

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
}
