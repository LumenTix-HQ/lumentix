import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import {
  CheckEventCredentialDto,
  IssueVerifiedCredentialDto,
  ReviewKycDocumentDto,
  RevokeCredentialDto,
  SubmitKycDocumentsDto,
  VerifyByDidStringDto,
} from './dto/kyc.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Identity / KYC')
@ApiBearerAuth()
@Controller('identity')
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 401, description: 'Unauthorized' })
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  // ── User endpoints ────────────────────────────────────────────────────────

  /**
   * POST /identity/kyc/submit
   *
   * Authenticated user submits identity documents to start the KYC process.
   * Once an admin approves the submission, a verified credential can be issued
   * that the user can reuse across all events without re-uploading documents.
   */
  @Post('kyc/submit')
  @ApiOperation({
    summary: 'Submit KYC documents',
    description:
      'Submit identity documents for KYC verification. ' +
      'Documents are stored as PENDING until reviewed by an admin. ' +
      'After approval a verified decentralized credential is issued and reusable across events.',
  })
  @ApiResponse({ status: 201, description: 'KYC documents submitted successfully' })
  @ApiResponse({ status: 409, description: 'A pending submission already exists for this document type' })
  submitKycDocuments(
    @Body() dto: SubmitKycDocumentsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.identityService.submitKycDocuments(req.user.id, dto);
  }

  /**
   * GET /identity/kyc
   *
   * Returns all KYC submissions for the authenticated user.
   */
  @Get('kyc')
  @ApiOperation({
    summary: 'Get my KYC submissions',
    description: "Returns all of the authenticated user's KYC document submissions and their current status.",
  })
  @ApiResponse({ status: 200, description: 'KYC submissions returned' })
  getKycSubmissions(@Req() req: AuthenticatedRequest) {
    return this.identityService.getKycSubmissions(req.user.id);
  }

  /**
   * GET /identity/credentials
   *
   * Returns all verified credentials issued to the authenticated user.
   */
  @Get('credentials')
  @ApiOperation({
    summary: 'Get my verified credentials',
    description:
      'Returns all verified decentralized identity credentials issued to the authenticated user. ' +
      'Active credentials can be used to pass KYC checks at any event.',
  })
  @ApiResponse({ status: 200, description: 'Credentials returned' })
  getUserCredentials(@Req() req: AuthenticatedRequest) {
    return this.identityService.getUserCredentials(req.user.id);
  }

  /**
   * POST /identity/credentials/:credentialId/verify
   *
   * Verifies that the given credential belongs to the caller, is not revoked,
   * and has not expired.  Core cross-event reuse check — no document re-upload needed.
   */
  @Post('credentials/:credentialId/verify')
  @ApiOperation({
    summary: 'Verify a DID credential (by credential ID)',
    description:
      'Checks that the credential belongs to the authenticated user, ' +
      'is not revoked, and has not expired. ' +
      'Enables KYC reuse across multiple events without re-submitting documents.',
  })
  @ApiParam({ name: 'credentialId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Verification result returned — check the `valid` field' })
  @ApiResponse({ status: 403, description: 'Credential does not belong to this user' })
  @ApiResponse({ status: 404, description: 'Credential not found' })
  verifyDidCredential(
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.identityService.verifyDidCredential(req.user.id, credentialId);
  }

  /**
   * POST /identity/credentials/verify-by-did
   *
   * Same as the endpoint above but accepts a DID string instead of a UUID.
   * Useful for NFC / QR scan flows where only the DID is available.
   */
  @Post('credentials/verify-by-did')
  @ApiOperation({
    summary: 'Verify a DID credential (by DID string)',
    description:
      'Looks up a credential by its DID string (e.g. did:lumentix:<uuid>) ' +
      'and confirms it belongs to the caller, is not revoked, and has not expired.',
  })
  @ApiResponse({ status: 201, description: 'Verification result returned — check the `valid` field' })
  @ApiResponse({ status: 403, description: 'Credential does not belong to this user' })
  @ApiResponse({ status: 404, description: 'No credential found for that DID' })
  verifyDidCredentialByDid(
    @Body() dto: VerifyByDidStringDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.identityService.verifyDidCredentialByDid(dto.did, req.user.id);
  }

  // ── Organizer / Admin: cross-event credential check ───────────────────────

  /**
   * POST /identity/credentials/check-event
   *
   * Organizer or admin queries whether a user holds a valid verified credential.
   * This is the primary cross-event reuse endpoint: an organizer calls it once
   * per event check-in and receives a definitive yes/no without the user needing
   * to re-submit any documents.
   */
  @Post('credentials/check-event')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Check a user's credential for event entry (organizer / admin)',
    description:
      'Organizer or admin endpoint. Checks whether the specified user holds ' +
      'any active verified credential (non-revoked, non-expired). ' +
      'Accepts LUMENTIX-issued credentials by default; set acceptAnyProvider=true to widen the check. ' +
      'The user does NOT need to re-submit documents — credentials are reused across events.',
  })
  @ApiResponse({ status: 201, description: 'Credential check result returned — check the `verified` field' })
  @ApiResponse({ status: 403, description: 'Caller is not an organizer or admin' })
  checkEventCredential(@Body() dto: CheckEventCredentialDto) {
    return this.identityService.checkEventCredential(dto);
  }

  // ── Admin-only endpoints ───────────────────────────────────────────────────

  /**
   * GET /identity/admin/kyc/pending
   *
   * Returns all KYC submissions that are awaiting admin review, oldest first.
   */
  @Get('admin/kyc/pending')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List pending KYC submissions (admin)',
    description: 'Returns all KYC submissions in PENDING status, ordered oldest-first for review queue.',
  })
  @ApiResponse({ status: 200, description: 'Pending submissions returned' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  listPendingKycSubmissions() {
    return this.identityService.listPendingKycSubmissions();
  }

  /**
   * PATCH /identity/admin/kyc/:kycId/review
   *
   * Admin approves or rejects a pending KYC submission.
   * An approved submission unlocks the ability to issue a verified credential.
   */
  @Patch('admin/kyc/:kycId/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Review a KYC submission (admin)',
    description:
      'Approve or reject a pending KYC submission. ' +
      'Reviewer notes are required when rejecting. ' +
      'An approved submission enables the admin to issue a verified credential for that user.',
  })
  @ApiParam({ name: 'kycId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'KYC submission updated' })
  @ApiResponse({ status: 400, description: 'Already reviewed, or notes missing on rejection' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 404, description: 'KYC submission not found' })
  reviewKycDocument(
    @Param('kycId', ParseUUIDPipe) kycId: string,
    @Body() dto: ReviewKycDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.identityService.reviewKycDocument(req.user.id, kycId, dto);
  }

  /**
   * POST /identity/admin/credentials/issue
   *
   * Admin issues a decentralized identity credential to a user whose KYC is approved.
   * The credential is assigned a unique DID (`did:lumentix:<uuid>`) and can be
   * verified at any Lumentix event without the user re-submitting documents.
   */
  @Post('admin/credentials/issue')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Issue a verified credential (admin)',
    description:
      'Issues a decentralized identity credential (DID) for a user whose KYC has been approved. ' +
      'A DID is auto-generated in the format `did:lumentix:<uuid>` if not supplied. ' +
      'The credential can be reused across all events — no document re-submission required.',
  })
  @ApiResponse({ status: 201, description: 'Verified credential issued' })
  @ApiResponse({ status: 400, description: 'No approved KYC found for user, or invalid expiry date' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 409, description: 'An active credential already exists for this user/provider' })
  issueVerifiedCredential(
    @Body() dto: IssueVerifiedCredentialDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.identityService.issueVerifiedCredential(req.user.id, dto);
  }

  /**
   * PATCH /identity/admin/credentials/:credentialId/revoke
   *
   * Admin revokes a previously issued credential.
   * The credential will immediately fail all future verification checks.
   */
  @Patch('admin/credentials/:credentialId/revoke')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Revoke a verified credential (admin)',
    description:
      'Revokes a verified credential. ' +
      'Once revoked the credential fails all verification checks across all events.',
  })
  @ApiParam({ name: 'credentialId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Credential revoked' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 404, description: 'Credential not found' })
  @ApiResponse({ status: 409, description: 'Credential already revoked' })
  revokeCredential(
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
    @Body() dto: RevokeCredentialDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.identityService.revokeCredential(req.user.id, credentialId, dto);
  }
}
