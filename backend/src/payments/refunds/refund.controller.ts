import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { RefundService } from './refund.service';
import { RefundResultDto } from './dto/refund-result.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';

@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  /**
   * POST /refunds/event/:eventId
   * Admin-only — triggers refunds for all confirmed payments on a cancelled event.
   */
  @Post('event/:eventId')
  @Roles(UserRole.ADMIN)
  async refundEvent(
    @Param('eventId') eventId: string,
  ): Promise<RefundResultDto[]> {
    return this.refundService.refundEvent(eventId);
  }
}
