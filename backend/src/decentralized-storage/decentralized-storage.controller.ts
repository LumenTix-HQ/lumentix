import { Role } from '../common/decorators/roles.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { IpfsPinningService } from './ipfs-pinning.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Req,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { DecentralizedStorageService } from './decentralized-storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  UploadMediaDto,
  PinMediaDto,
  MigrateMediaDto,
} from './dto/storage.dto';

@ApiTags('Decentralized Storage')
@ApiBearerAuth()
@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
@ApiResponse({ status: 404, description: 'Stored media not found' })
export class DecentralizedStorageController {
  constructor(
    private readonly storageService: DecentralizedStorageService,
    private readonly pinning: IpfsPinningService,
    @InjectRepository(Event) private readonly events: Repository<Event>,
  ) {}

  private async requireOwner(eventId: string, req: AuthenticatedRequest) {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== req.user.id && req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the event organizer can manage media');
    }
  }

  @Post('migrate')
  async migrate(
    @Body() dto: MigrateMediaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireOwner(dto.eventId, req);
    return this.pinning.migrate_unpinned_assets(dto.eventId, dto.hashes);
  }

  @Get('status/:hash')
  status(@Param('hash') hash: string) {
    return this.pinning.verify_pin_status(hash);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload event media to decentralized storage' })
  @ApiResponse({ status: 201, description: 'Media uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid media payload' })
  @ApiResponse({ status: 422, description: 'Media upload failed' })
  async uploadMedia(
    @Body() dto: UploadMediaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.requireOwner(dto.eventId, req);
    return this.storageService.upload_media_to_decentralized_storage(
      dto.eventId,
      dto.fileName,
      dto.mimeType,
      dto.content,
      dto.contentEncoding,
    );
  }

  @Post('pin')
  @ApiOperation({ summary: 'Pin event media in decentralized storage' })
  @ApiResponse({ status: 201, description: 'Media pinned' })
  @ApiResponse({ status: 400, description: 'Invalid media hash' })
  @ApiResponse({ status: 422, description: 'Media could not be pinned' })
  async pinMedia(@Body() dto: PinMediaDto, @Req() req: AuthenticatedRequest) {
    await this.requireOwner(dto.eventId, req);
    return this.storageService.pin_event_media(dto.eventId, dto.hash);
  }

  @Get('retrieve/:hash')
  @ApiOperation({ summary: 'Retrieve decentralized media by hash' })
  @ApiResponse({ status: 200, description: 'Stored media returned' })
  retrieveMedia(@Param('hash') hash: string) {
    return this.storageService.retrieve_media_by_hash(hash);
  }
}
