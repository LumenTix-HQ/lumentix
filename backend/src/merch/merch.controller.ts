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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MerchService } from './merch.service';
import { CreateMerchItemDto } from './dto/create-merch-item.dto';
import { PurchaseMerchDto } from './dto/purchase-merch.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Token-Gated Merchandise')
@Controller()
export class MerchController {
  constructor(private readonly merchService: MerchService) {}

  @Post('events/:eventId/merch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a merchandise item', description: 'Organizer-only. Optionally restrict the item to ticket NFT or VIP badge holders.' })
  @ApiResponse({ status: 201, description: 'Merchandise item created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateMerchItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.merchService.createMerchItem(eventId, dto, req.user.id);
  }

  @Get('events/:eventId/merch')
  @ApiOperation({ summary: 'List merchandise items', description: 'Public. Lists merchandise items for an event, including token-gating rules.' })
  @ApiResponse({ status: 200, description: 'List of merchandise items' })
  list(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.merchService.listMerchItems(eventId);
  }

  @Post('merch/:id/verify-eligibility')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify token-gate eligibility', description: 'Checks whether the caller holds the ticket NFT or VIP badge required to purchase a merch item.' })
  @ApiResponse({ status: 200, description: 'Eligibility result' })
  verifyEligibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseMerchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.merchService.verifyTokenGateEligibility(id, req.user.id, dto);
  }

  @Post('merch/:id/purchase')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Purchase a token-gated merchandise item', description: 'Verifies eligibility, then reserves stock for the buyer.' })
  @ApiResponse({ status: 201, description: 'Purchase reservation created' })
  @ApiResponse({ status: 403, description: 'Not eligible for this token-gated item' })
  @ApiResponse({ status: 400, description: 'Item out of stock' })
  purchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseMerchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.merchService.restrictMerchPurchase(id, req.user.id, dto);
  }

  @Post('merch/reservations/:id/release')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Release a token-gate reservation', description: 'Buyer or organizer only. Releases a reserved hold and returns stock to the pool.' })
  @ApiResponse({ status: 200, description: 'Reservation released' })
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.merchService.releaseTokenGate(id, req.user.id);
  }
}
