import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { InsuranceService } from './insurance.service';
import { PurchaseInsuranceDto } from './dto/purchase-insurance.dto';
import { ProcessInsuranceClaimDto, CancellationReason } from './dto/process-insurance-claim.dto';
import {
  InsurancePolicyDto,
  InsurancePoolDto,
  InsuranceClaimResultDto,
  InsuranceClaimEscalationDto,
} from './dto/insurance-policy.dto';
import { ReviewInsuranceClaimDto } from './dto/review-insurance-claim.dto';

@ApiTags('Insurance')
@ApiBearerAuth()
@Controller('insurance')
@UseGuards(JwtAuthGuard)
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  // ── purchase_insurance ────────────────────────────────────────────────────

  @Post('purchase')
  @ApiOperation({
    summary: 'Purchase insurance for a ticket',
    description:
      'Purchase cancellation protection for a ticket. ' +
      'The premium is 10% of the ticket price and provides a full refund ' +
      'if the event is cancelled for a qualifying reason.',
  })
  @ApiResponse({
    status: 201,
    description: 'Insurance policy created successfully',
    type: InsurancePolicyDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request — ticket not valid or event already ended' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — ticket not owned by caller' })
  @ApiResponse({ status: 404, description: 'Ticket or event not found' })
  @ApiResponse({ status: 409, description: 'Insurance already purchased for this ticket' })
  purchaseInsurance(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PurchaseInsuranceDto,
  ): Promise<InsurancePolicyDto> {
    return this.insuranceService.purchaseInsurance(req.user.id, dto);
  }

  // ── process_insurance_claim ───────────────────────────────────────────────

  @Post('claim')
  @ApiOperation({
    summary: 'File an insurance claim',
    description:
      'Process an insurance claim for a cancelled event. ' +
      'Validates the cancellation reason, verifies the event is cancelled, ' +
      'and issues a full refund to the ticket holder\'s Stellar wallet.',
  })
  @ApiResponse({
    status: 201,
    description: 'Insurance claim processed and refund issued',
    type: InsuranceClaimResultDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request — invalid reason, event not cancelled, or policy not active' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — policy not owned by caller' })
  @ApiResponse({ status: 404, description: 'Ticket, policy, or event not found' })
  processInsuranceClaim(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ProcessInsuranceClaimDto,
  ): Promise<InsuranceClaimResultDto> {
    return this.insuranceService.processInsuranceClaim(req.user.id, dto);
  }

  @Post('auto-adjudicate')
  @ApiOperation({
    summary: 'Auto-adjudicate an insurance claim',
    description:
      'Automatically process straightforward event cancellation insurance claims using rule-based criteria before escalating edge cases to human reviewers.',
  })
  @ApiResponse({
    status: 201,
    description: 'Claim auto-approved and paid',
    type: InsuranceClaimResultDto,
  })
  @ApiResponse({
    status: 202,
    description: 'Claim escalated to a human reviewer',
    type: InsuranceClaimEscalationDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Claim rejected — fails a required rule (inactive policy, event not cancelled, …)',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — policy not owned by caller',
  })
  autoAdjudicateClaim(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ProcessInsuranceClaimDto,
  ) {
    return this.insuranceService.auto_adjudicate_claim(req.user.id, dto);
  }

  // ── Human review of escalated claims (admin) ──────────────────────────────

  @Get('claims/review-queue')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'List insurance claims awaiting human review',
    description:
      'Admin-only. Claims escalated by auto-adjudication, oldest first.',
  })
  @ApiResponse({ status: 200, type: [InsurancePolicyDto] })
  @ApiResponse({ status: 403, description: 'Forbidden — admin only' })
  listClaimsUnderReview() {
    return this.insuranceService.listClaimsUnderReview();
  }

  @Post('claims/:policyId/review')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Approve or reject an escalated insurance claim',
    description:
      'Admin-only. Approving pays the coverage to the policy holder from the event escrow; rejecting closes the claim without payout.',
  })
  @ApiParam({
    name: 'policyId',
    description: 'UUID of the insurance policy under review',
  })
  @ApiResponse({ status: 201, description: 'Decision recorded' })
  @ApiResponse({ status: 400, description: 'Policy is not under review' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin only' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  reviewEscalatedClaim(
    @Req() req: AuthenticatedRequest,
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: ReviewInsuranceClaimDto,
  ) {
    return this.insuranceService.reviewEscalatedClaim(
      policyId,
      req.user.id,
      dto.decision,
      dto.note,
    );
  }

  // ── validate_cancellation_reason ──────────────────────────────────────────

  @Get('validate')
  @ApiOperation({
    summary: 'Validate a cancellation reason',
    description:
      'Check whether a given cancellation reason qualifies for an insurance payout ' +
      'for the specified ticket. Returns true if the reason is valid and the event is cancelled.',
  })
  @ApiQuery({
    name: 'ticketId',
    required: true,
    description: 'UUID of the ticket',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({
    name: 'reason',
    required: true,
    enum: CancellationReason,
    description: 'Cancellation reason to validate',
  })
  @ApiResponse({ status: 200, description: 'Validation result', type: Boolean })
  @ApiResponse({ status: 400, description: 'Bad request — missing or invalid parameters' })
  validateCancellationReason(
    @Query('ticketId') ticketId: string,
    @Query('reason') reason: CancellationReason,
  ): Promise<boolean> {
    return this.insuranceService.validateCancellationReason(ticketId, reason);
  }

  // ── get policy by ticket ──────────────────────────────────────────────────

  @Get('policy/:ticketId')
  @ApiOperation({
    summary: 'Get insurance policy by ticket ID',
    description: 'Retrieve the insurance policy for a specific ticket. Only the policy holder can access it.',
  })
  @ApiParam({ name: 'ticketId', description: 'UUID of the ticket', type: String })
  @ApiResponse({
    status: 200,
    description: 'Insurance policy found',
    type: InsurancePolicyDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — policy not owned by caller' })
  @ApiResponse({ status: 404, description: 'Insurance policy not found' })
  getInsurancePolicyByTicket(
    @Req() req: AuthenticatedRequest,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<InsurancePolicyDto> {
    return this.insuranceService.getInsurancePolicyByTicket(ticketId, req.user.id);
  }

  // ── get my policies ───────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({
    summary: 'Get my insurance policies',
    description: 'Retrieve all insurance policies purchased by the current user.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of insurance policies',
    type: [InsurancePolicyDto],
  })
  getMyPolicies(
    @Req() req: AuthenticatedRequest,
  ): Promise<InsurancePolicyDto[]> {
    return this.insuranceService.getMyPolicies(req.user.id);
  }

  // ── insurance pool stats ──────────────────────────────────────────────────

  @Get('pool')
  @ApiOperation({
    summary: 'Get insurance pool statistics',
    description:
      'Retrieve aggregate statistics for the insurance pool: ' +
      'total policies, claims processed, premiums collected, and claims paid.',
  })
  @ApiResponse({
    status: 200,
    description: 'Insurance pool statistics',
    type: InsurancePoolDto,
  })
  getInsurancePool(): Promise<InsurancePoolDto> {
    return this.insuranceService.getInsurancePool();
  }
}
