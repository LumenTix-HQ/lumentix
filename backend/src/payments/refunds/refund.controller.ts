import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RefundService } from './refund.service';
import { RefundResultDto } from './dto/refund-result.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';

@ApiTags('Refunds')
@ApiBearerAuth()
@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post('event/:eventId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Refund all event tickets', description: 'Admin-only. Triggers refunds for all confirmed payments on a cancelled event.' })
  @ApiResponse({ status: 201, description: 'Refunds initiated', type: [RefundResultDto] })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async refundEvent(
    @Param('eventId') eventId: string,
  ): Promise<RefundResultDto[]> {
    return this.refundService.refundEvent(eventId);
  }
}
