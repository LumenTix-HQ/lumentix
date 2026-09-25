import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrivacyService } from './privacy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Privacy & GDPR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get('export-data')
  @ApiOperation({
    summary: 'Export all data held for the current user (GDPR Article 15)',
    description: `Returns a machine-readable (JSON) export of all personal data in the system including:
    - User profile
    - Event registrations, tickets, reviews
    - Chat messages
    - Loyalty program account and transactions
    - Insurance policies and claims
    - Gamification achievements and badges
    - Social profile and connections
    - Payment records and transaction history
    
    This implements the GDPR Article 15 right of access (data portability).
    The export includes a coverage note documenting what is included.`,
  })
  @ApiResponse({ status: 200, description: 'Complete GDPR data export returned' })
  exportData(@Req() req: AuthenticatedRequest) {
    return this.privacyService.exportUserData(req.user.id);
  }

  @Post('request-deletion')
  @ApiOperation({ summary: 'Request deletion of the current user account', description: 'Soft-deletes the account and records a deletion request for cascading anonymization.' })
  @ApiResponse({ status: 201, description: 'Deletion requested' })
  requestDeletion(@Req() req: AuthenticatedRequest) {
    return this.privacyService.requestDataDeletion(req.user.id, req.user.id);
  }

  @Post('anonymize')
  @ApiOperation({ summary: 'Anonymize historical records for the current user', description: 'Scrubs personally identifying data from reviews and chat messages while preserving anonymized analytics. Requires a prior deletion request.' })
  @ApiResponse({ status: 200, description: 'Historical records anonymized' })
  @ApiResponse({ status: 400, description: 'No pending deletion request found' })
  anonymize(@Req() req: AuthenticatedRequest) {
    return this.privacyService.anonymizeHistoricalRecords(req.user.id, req.user.id);
  }
}
