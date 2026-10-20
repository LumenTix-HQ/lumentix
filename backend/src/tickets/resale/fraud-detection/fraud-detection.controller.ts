import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request.interface';
import { FraudDetectionService } from './fraud-detection.service';
import { AnalyzeTradeDto } from './dto/analyze-trade.dto';

@ApiTags('Fraud Detection')
@ApiBearerAuth()
@Controller('resale/fraud')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN)
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
export class FraudDetectionController {
  constructor(private readonly fraudDetectionService: FraudDetectionService) {}

  @Post('analyze')
  @ApiOperation({
    summary: 'Analyze a trade for fraud risk',
    description: 'Runs pattern-matching heuristics against a proposed or executed trade and returns a risk score.',
  })
  @ApiResponse({ status: 201, description: 'Risk analysis result' })
  async analyzeTradePatterns(@Body() dto: AnalyzeTradeDto) {
    return this.fraudDetectionService.analyzeTradePatterns(dto);
  }

  @Get('ticket/:ticketId')
  @ApiOperation({
    summary: 'List fraud flags for a ticket',
    description: 'Returns the fraud-flag history recorded against a ticket.',
  })
  @ApiResponse({ status: 200, description: 'Fraud flags returned' })
  async getFlagsForTicket(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.fraudDetectionService.getFlagsForTicket(ticketId);
  }

  @Post(':flagId/hold')
  @ApiOperation({
    summary: 'Place a flagged trade on hold',
    description: 'Prevents settlement of a flagged trade pending manual review.',
  })
  @ApiResponse({ status: 201, description: 'Trade placed on hold' })
  @ApiResponse({ status: 404, description: 'Fraud flag not found' })
  async holdSuspiciousTrade(@Param('flagId', ParseUUIDPipe) flagId: string) {
    return this.fraudDetectionService.holdSuspiciousTrade(flagId);
  }

  @Post(':flagId/release')
  @ApiOperation({
    summary: 'Release a held trade after manual review',
    description: 'Clears a fraud hold once a reviewer has determined the trade is legitimate.',
  })
  @ApiResponse({ status: 201, description: 'Hold released' })
  @ApiResponse({ status: 404, description: 'Fraud flag not found' })
  async releaseTradeHold(
    @Param('flagId', ParseUUIDPipe) flagId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.fraudDetectionService.releaseTradeHold(flagId, req.user.id);
  }
}
