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
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';
import { RedeemPointsDto } from './dto/redeem-points.dto';
import { AwardPointsDto } from './dto/award-points.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Loyalty')
@ApiBearerAuth()
@Controller('loyalty')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // ── GET /loyalty/status ────────────────────────────────────────────────────

  @Get('status')
  @ApiOperation({
    summary: 'Get my loyalty status',
    description:
      'Returns current points balance, tier, active discount codes, and recent transaction history.',
  })
  @ApiResponse({ status: 200, description: 'Loyalty status returned' })
  getMyLoyaltyStatus(@Req() req: AuthenticatedRequest) {
    return this.loyaltyService.getUserLoyaltyStatus(req.user.id);
  }

  // ── GET /loyalty/users/:userId/status (admin) ──────────────────────────────

  @Get('users/:userId/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Get loyalty status for any user' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Loyalty status returned' })
  getUserLoyaltyStatus(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.loyaltyService.getUserLoyaltyStatus(userId);
  }

  // ── POST /loyalty/redeem ───────────────────────────────────────────────────

  @Post('redeem')
  @ApiOperation({
    summary: 'Redeem points for a discount code',
    description:
      'Exchange loyalty points for a discount code. 100 points = 1% discount, max 50%. Code is valid for 90 days.',
  })
  @ApiResponse({ status: 201, description: 'Discount code created' })
  @ApiResponse({ status: 400, description: 'Insufficient points or below minimum' })
  redeemPoints(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RedeemPointsDto,
  ) {
    return this.loyaltyService.redeemPointsForDiscount(req.user.id, dto);
  }

  // ── POST /loyalty/award (admin / internal) ─────────────────────────────────

  @Post('award')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: '[Admin] Manually award loyalty points to a user',
  })
  @ApiResponse({ status: 201, description: 'Points awarded' })
  awardPoints(@Body() dto: AwardPointsDto) {
    return this.loyaltyService.awardLoyaltyPoints(dto);
  }

  // ── POST /loyalty/apply-discount ───────────────────────────────────────────

  @Post('apply-discount')
  @ApiOperation({
    summary: 'Apply a discount code to an event purchase',
    description: 'Validates and marks the discount code as used.',
  })
  @ApiResponse({ status: 201, description: 'Discount applied' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or already used code' })
  applyDiscount(
    @Req() req: AuthenticatedRequest,
    @Body() body: { code: string; eventId: string },
  ) {
    return this.loyaltyService.applyDiscountCode(
      body.code,
      req.user.id,
      body.eventId,
    );
  }
}
