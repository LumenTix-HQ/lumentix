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
import { MerchPreorderService } from './merch-preorder.service';
import { CreateMerchVariantDto } from './dto/create-merch-variant.dto';
import { CreateMerchPreorderDto } from './dto/create-merch-preorder.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Merchandise Pre-orders')
@Controller()
export class MerchPreorderController {
  constructor(private readonly merchPreorderService: MerchPreorderService) {}

  @Post('merch/:merchItemId/variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a size/color variant for a merchandise item', description: 'Organizer-only.' })
  @ApiResponse({ status: 201, description: 'Variant created' })
  createVariant(
    @Param('merchItemId', ParseUUIDPipe) merchItemId: string,
    @Body() dto: CreateMerchVariantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.merchPreorderService.createMerchVariant(merchItemId, dto, req.user.id);
  }

  @Get('merch/:merchItemId/variants')
  @ApiOperation({ summary: 'List variants for a merchandise item', description: 'Public.' })
  @ApiResponse({ status: 200, description: 'List of variants' })
  listVariants(@Param('merchItemId', ParseUUIDPipe) merchItemId: string) {
    return this.merchPreorderService.listVariants(merchItemId);
  }

  @Post('merch-preorders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pre-order merchandise with a ticket purchase', description: 'Ticket holder-only. Reserves stock for the chosen variant.' })
  @ApiResponse({ status: 201, description: 'Pre-order created' })
  @ApiResponse({ status: 400, description: 'Insufficient stock' })
  create(
    @Body() dto: CreateMerchPreorderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.merchPreorderService.createMerchPreorder(dto, req.user.id);
  }

  @Post('merch-preorders/:id/confirm-pickup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm pre-order pickup at the event', description: 'Organizer-only.' })
  @ApiResponse({ status: 200, description: 'Pre-order marked as picked up' })
  confirmPickup(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.merchPreorderService.confirmPreorderPickup(id, req.user.id);
  }
}
