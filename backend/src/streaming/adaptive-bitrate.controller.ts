import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdaptiveBitrateService } from './adaptive-bitrate.service';
import {
  DetectViewerBandwidthDto,
  ReportBufferingEventDto,
  SwitchBitrateTierDto,
  ViewerStreamStateDto,
} from './dto/adaptive-bitrate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

/**
 * Viewer-facing playback controls.
 *
 * Unlike `StreamingController`, which is organizer-only, these act on the
 * calling viewer's own session and are therefore open to any authenticated
 * user holding access to the event stream.
 */
@ApiTags('Streaming')
@ApiBearerAuth()
@Controller('streaming')
@UseGuards(JwtAuthGuard)
export class AdaptiveBitrateController {
  constructor(private readonly adaptiveBitrateService: AdaptiveBitrateService) {}

  @Post('events/:eventId/viewer/bandwidth')
  @ApiOperation({
    summary: "Report the player's measured bandwidth and get the selected tier",
  })
  @ApiResponse({ status: 201, type: ViewerStreamStateDto })
  detectViewerBandwidth(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: DetectViewerBandwidthDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ViewerStreamStateDto> {
    return this.adaptiveBitrateService.detectViewerBandwidth(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Post('events/:eventId/viewer/tier')
  @ApiOperation({
    summary: 'Pin a quality tier manually, or clear the pin to resume automatic',
  })
  @ApiResponse({ status: 201, type: ViewerStreamStateDto })
  switchBitrateTier(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SwitchBitrateTierDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ViewerStreamStateDto> {
    return this.adaptiveBitrateService.switchBitrateTier(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Post('events/:eventId/viewer/buffering')
  @ApiOperation({ summary: 'Report a playback stall' })
  @ApiResponse({ status: 201, type: ViewerStreamStateDto })
  reportBufferingEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ReportBufferingEventDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ViewerStreamStateDto> {
    return this.adaptiveBitrateService.reportBufferingEvent(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Get('events/:eventId/viewer/state')
  @ApiOperation({ summary: "Read the viewer's current playback state" })
  @ApiResponse({ status: 200, type: ViewerStreamStateDto })
  getViewerStreamState(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ViewerStreamStateDto> {
    return this.adaptiveBitrateService.getViewerStreamState(
      eventId,
      req.user.id,
    );
  }
}
