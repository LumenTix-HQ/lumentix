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
  }
}
