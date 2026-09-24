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
import { IdentityService } from './identity.service';
import {
  IssueVerifiedCredentialDto,
  SubmitKycDocumentsDto,
  VerifyDidCredentialDto,
} from './dto/kyc.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Identity / KYC')
@ApiBearerAuth()
@Controller('identity')
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 401, description: 'Unauthorized' })
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  /**
   * Submit KYC documents.
   * The authenticated user submits their own documents; the userId is read from the JWT.
   */
  @Post('kyc/submit')
  @ApiOperation({
    summary: 'Submit KYC documents',
    description:
      'Allows a user to submit identity documents for KYC verification. ' +
      'Documents are stored as PENDING until reviewed by an admin.',
  })
  @ApiResponse({ status: 201, description: 'KYC documents submitted' })
  @ApiResponse({ status: 409, description: 'Pending submission already exists' })
  submitKycDocuments(
    @Body() dto: SubmitKycDocumentsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.identityService.submitKycDocuments(req.user.id, dto);
  }

  /**
   * Issue a verified decentralized identity credential.
   * Admin-only: requires an approved KYC document for the target user.
   */
  @Post('credentials/issue')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Issue a verified credential',
    description:
      'Admin-only. Issues a decentralized identity credential for a user whose KYC has been approved. ' +
      'The credential can be reused across multiple events without re-submitting documents.',
  })
  @ApiResponse({ status: 201, description: 'Verified credential issued' })
  @ApiResponse({ status: 400, description: 'No approved KYC found for user' })
  @ApiResponse({ status: 409, description: 'Active credential already exists' })
  issueVerifiedCredential(
    @Body() dto: IssueVerifiedCredentialDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.identityService.issueVerifiedCredential(req.user.id, dto);
  }

  /**
   * Verify a DID credential for the authenticated user.
   */
  @Post('credentials/:credentialId/verify')
  @ApiOperation({
    summary: 'Verify a DID credential',
    description:
      'Verifies that the given credential belongs to the authenticated user, ' +
      'is not revoked, and has not expired.',
  })
  @ApiResponse({ status: 201, description: 'Verification result returned' })
  @ApiResponse({ status: 403, description: 'Credential does not belong to user' })
  @ApiResponse({ status: 404, description: 'Credential not found' })
  verifyDidCredential(
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.identityService.verifyDidCredential(req.user.id, credentialId);
  }

  /**
   * Get all KYC submissions for the authenticated user.
   */
  @Get('kyc')
  @ApiOperation({
    summary: 'Get KYC submissions',
    description: "Returns all of the authenticated user's KYC document submissions.",
  })
  @ApiResponse({ status: 200, description: 'KYC submissions returned' })
  getKycSubmissions(@Req() req: AuthenticatedRequest) {
    return this.identityService.getKycSubmissions(req.user.id);
  }

  /**
   * Get all issued credentials for the authenticated user.
   */
  @Get('credentials')
  @ApiOperation({
    summary: 'Get user credentials',
    description: "Returns all verified credentials issued to the authenticated user.",
  })
  @ApiResponse({ status: 200, description: 'Credentials returned' })
  getUserCredentials(@Req() req: AuthenticatedRequest) {
    return this.identityService.getUserCredentials(req.user.id);
  }
}
