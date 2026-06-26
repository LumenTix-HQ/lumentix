import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DecentralizedStorageService } from './decentralized-storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadMediaDto, PinMediaDto } from './dto/storage.dto';

@ApiTags('Decentralized Storage')
@ApiBearerAuth()
@Controller('storage')
@UseGuards(JwtAuthGuard)
export class DecentralizedStorageController {
  constructor(private readonly storageService: DecentralizedStorageService) {}

  @Post('upload')
  uploadMedia(@Body() dto: UploadMediaDto) {
    return this.storageService.upload_media_to_decentralized_storage(dto.eventId, dto.fileName, dto.mimeType, dto.content);
  }

  @Post('pin')
  pinMedia(@Body() dto: PinMediaDto) {
    return this.storageService.pin_event_media(dto.eventId, dto.hash);
  }

  @Get('retrieve/:hash')
  retrieveMedia(@Param('hash') hash: string) {
    return this.storageService.retrieve_media_by_hash(hash);
  }
}
