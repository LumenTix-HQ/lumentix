import {
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { PaginationDto } from '../../common/pagination/dto/pagination.dto';
import { RefundResultDto } from './dto/refund-result.dto';
import { RefundService } from './refund.service';

@ApiTags('Refunds')
@ApiBearerAuth()
@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post('event/:eventId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Refund all event tickets',
    description:
      'Authenticated admin endpoint. Initiates refunds for all confirmed payments tied to an event.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 201, description: 'Refunds initiated', type: [RefundResultDto] })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  refundEvent(@Param('eventId') eventId: string): Promise<RefundResultDto[]> {
    return this.refundService.refundEvent(eventId);
  }

  @Get('event/:eventId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get refund history for an event',
    description:
      'Authenticated admin endpoint. Returns paginated refund history for a specific event.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Refund history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getRefundHistory(
    @Param('eventId') eventId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.refundService.getRefundHistoryForEvent(eventId, paginationDto);
  }

  @Get(':paymentId/eligibility')
  @ApiOperation({
    summary: 'Check refund eligibility',
    description:
      'Authenticated. Returns refund eligibility and the computed refund amount for a payment.',
  })
  @ApiParam({ name: 'paymentId', description: 'Payment UUID' })
  @ApiResponse({ status: 200, description: 'Refund eligibility calculated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  checkEligibility(@Param('paymentId') paymentId: string) {
    return this.refundService.checkRefundEligibility(paymentId);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get my refund history',
    description:
      'Authenticated. Returns paginated refund history for the current user.',
  })
  @ApiResponse({ status: 200, description: 'User refund history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMyRefunds(
    @Req() req: AuthenticatedRequest,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.refundService.getMyRefunds(req.user.id, paginationDto);
  }
}
