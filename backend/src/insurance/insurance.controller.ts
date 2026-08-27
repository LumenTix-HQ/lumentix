import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { InsuranceService } from './insurance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { InsurerStatus } from './entities/insurer.entity';

import { RegisterInsurerDto } from './dto/register-insurer.dto';
import { CreateInsuranceProductDto } from './dto/create-insurance-product.dto';
import { UpdateInsuranceProductDto } from './dto/update-insurance-product.dto';
import { ListInsuranceProductsDto } from './dto/list-insurance-products.dto';
import { CompareInsuranceOptionsDto } from './dto/compare-insurance-options.dto';
import { PurchasePolicyDto } from './dto/purchase-policy.dto';
import { ProcessInsuranceClaimDto } from './dto/process-insurance-claim.dto';
import { ReviewClaimDto } from './dto/review-claim.dto';
import { ListClaimsDto } from './dto/list-claims.dto';

@ApiTags('Insurance Marketplace')
@ApiBearerAuth()
@Controller('insurance')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 429, description: 'Too Many Requests' })
@ApiResponse({ status: 401, description: 'Unauthorized' })
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // INSURER REGISTRATION & PROFILE
  // ─────────────────────────────────────────────────────────────────────────

  @Post('insurers/register')
  @ApiOperation({ summary: 'Register as an insurer', description: 'Create a third-party insurer profile. Starts in PENDING_APPROVAL state.' })
  @ApiResponse({ status: 201, description: 'Insurer registered.' })
  @ApiResponse({ status: 409, description: 'Profile or license number already exists.' })
  registerInsurer(
    @Body() dto: RegisterInsurerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.registerInsurer(dto, req.user.id);
  }

  @Get('insurers/me')
  @ApiOperation({ summary: 'Get own insurer profile' })
  @ApiResponse({ status: 200, description: 'Insurer profile.' })
  @ApiResponse({ status: 404, description: 'No insurer profile found.' })
  getMyInsurerProfile(@Req() req: AuthenticatedRequest) {
    return this.insuranceService.getMyInsurerProfile(req.user.id);
  }

  @Get('insurers/:id')
  @ApiOperation({ summary: 'Get insurer by ID (public)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Insurer details.' })
  @ApiResponse({ status: 404, description: 'Insurer not found.' })
  getInsurer(@Param('id', ParseUUIDPipe) id: string) {
    return this.insuranceService.getInsurer(id);
  }

  @Patch('insurers/:id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update insurer status (admin only)', description: 'Approve, suspend, or reject an insurer.' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Status updated.' })
  @ApiResponse({ status: 403, description: 'Admin access required.' })
  updateInsurerStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: InsurerStatus,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.updateInsurerStatus(id, status, req.user.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INSURANCE PRODUCTS  (list_insurance_product)
  // ─────────────────────────────────────────────────────────────────────────

  @Get('products')
  @ApiOperation({
    summary: 'list_insurance_product — Browse marketplace products',
    description: 'Filter by coverage type, insurer, premium range, attendee count, and more. Only products from approved insurers are shown.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of insurance products.' })
  listInsuranceProducts(@Query() dto: ListInsuranceProductsDto) {
    return this.insuranceService.listInsuranceProducts(dto);
  }

  @Get('products/compare')
  @ApiOperation({
    summary: 'compare_insurance_options — Side-by-side product comparison',
    description: 'Compare 2–5 products. Returns value score and eligibility status per product. Pass eventId + attendeeCount for eligibility checks.',
  })
  @ApiResponse({ status: 200, description: 'Comparison results.' })
  @ApiResponse({ status: 404, description: 'One or more products not found.' })
  compareInsuranceOptions(@Query() dto: CompareInsuranceOptionsDto) {
    return this.insuranceService.compareInsuranceOptions(dto);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get a single insurance product by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Product details.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  getInsuranceProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.insuranceService.getInsuranceProduct(id);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create insurance product (insurer only)', description: 'Creates a DRAFT product. Activate it separately via PATCH /products/:id.' })
  @ApiResponse({ status: 201, description: 'Product created.' })
  @ApiResponse({ status: 403, description: 'Not an approved insurer.' })
  createInsuranceProduct(
    @Body() dto: CreateInsuranceProductDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.createInsuranceProduct(dto, req.user.id);
  }

  @Put('products/:id')
  @ApiOperation({ summary: 'Update insurance product (insurer only)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Product updated.' })
  @ApiResponse({ status: 403, description: 'Forbidden — not your product.' })
  updateInsuranceProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInsuranceProductDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.updateInsuranceProduct(id, dto, req.user.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POLICIES
  // ─────────────────────────────────────────────────────────────────────────

  @Post('policies')
  @ApiOperation({
    summary: 'Purchase an insurance policy',
    description: 'Buy a policy for a specific event. If paymentTxHash is provided the policy is immediately activated.',
  })
  @ApiResponse({ status: 201, description: 'Policy purchased.' })
  @ApiResponse({ status: 400, description: 'Eligibility check failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate active policy.' })
  purchasePolicy(
    @Body() dto: PurchasePolicyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.purchasePolicy(dto, req.user.id);
  }

  @Post('policies/:id/confirm-payment')
  @ApiOperation({ summary: 'Confirm premium payment for a pending policy' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 201, description: 'Policy activated.' })
  @ApiResponse({ status: 400, description: 'Policy not in PENDING_PAYMENT state.' })
  confirmPolicyPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('txHash') txHash: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.confirmPolicyPayment(id, txHash, req.user.id);
  }

  @Get('policies/mine')
  @ApiOperation({ summary: 'List my policies' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of own policies.' })
  listMyPolicies(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.listMyPolicies(req.user.id, +page, +limit);
  }

  @Get('policies/:id')
  @ApiOperation({ summary: 'Get a policy by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Policy details.' })
  @ApiResponse({ status: 403, description: 'Not your policy.' })
  getPolicyById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.getPolicyById(id, req.user.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLAIMS  (process_insurance_claim)
  // ─────────────────────────────────────────────────────────────────────────

  @Post('claims')
  @ApiOperation({
    summary: 'process_insurance_claim — Submit a new insurance claim',
    description: 'File a claim against an active policy. Attach evidence URLs and describe the incident.',
  })
  @ApiResponse({ status: 201, description: 'Claim submitted successfully.' })
  @ApiResponse({ status: 400, description: 'Policy not active or amount exceeds coverage.' })
  @ApiResponse({ status: 409, description: 'An open claim already exists for this policy.' })
  processInsuranceClaim(
    @Body() dto: ProcessInsuranceClaimDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.processInsuranceClaim(dto, req.user.id);
  }

  @Get('claims')
  @ApiOperation({
    summary: 'List claims',
    description: 'Regular users see only their own claims. Insurers see claims for their products. Admins can filter freely.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of claims.' })
  listClaims(
    @Query() dto: ListClaimsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const isInsurer = req.user.role === Role.ADMIN ||
      (req.user as any).isInsurer === true;
    return this.insuranceService.listClaims(dto, req.user.id, isInsurer);
  }

  @Get('claims/:id')
  @ApiOperation({ summary: 'Get a claim by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Claim details.' })
  @ApiResponse({ status: 403, description: 'Not your claim.' })
  getClaimById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isInsurer = req.user.role === Role.ADMIN;
    return this.insuranceService.getClaimById(id, req.user.id, isInsurer);
  }

  @Post('claims/:id/review')
  @ApiOperation({ summary: 'Review a claim (insurer only)', description: 'Approve or reject a submitted / under-review claim.' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 201, description: 'Claim reviewed.' })
  @ApiResponse({ status: 400, description: 'Invalid claim state or missing approvedAmount.' })
  @ApiResponse({ status: 403, description: 'Not the insurer for this policy.' })
  reviewClaim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewClaimDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.reviewClaim(id, dto, req.user.id);
  }

  @Post('claims/:id/pay')
  @ApiOperation({ summary: 'Mark an approved claim as paid (insurer only)', description: 'Record the payout transaction hash for an APPROVED claim.' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 201, description: 'Claim marked as paid.' })
  @ApiResponse({ status: 400, description: 'Claim not in APPROVED state.' })
  markClaimPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('payoutTxHash') payoutTxHash: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.insuranceService.markClaimPaid(id, payoutTxHash, req.user.id);
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { InsuranceService } from './insurance.service';
import { PurchaseInsuranceDto } from './dto/purchase-insurance.dto';
import { ProcessInsuranceClaimDto, CancellationReason } from './dto/process-insurance-claim.dto';
import {
  InsurancePolicyDto,
  InsurancePoolDto,
  InsuranceClaimResultDto,
} from './dto/insurance-policy.dto';

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
  autoAdjudicateClaim(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ProcessInsuranceClaimDto,
  ) {
    return this.insuranceService.auto_adjudicate_claim(req.user.id, dto);
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
