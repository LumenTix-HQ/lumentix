import {
  Body,
  Controller,
  ForbiddenException,
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
import { PaginationDto } from '../common/pagination/pagination.dto';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('history')
  @ApiOperation({
    summary: 'Get payment history',
    description:
      'Authenticated. Returns paginated payment history for the current user.',
  })
  @ApiResponse({ status: 200, description: 'Payment history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getHistory(
    @Req() req: AuthenticatedRequest,
    @Query() dto: PaginationDto,
  ) {
    return this.paymentsService.getHistory(req.user.id, dto);
  }

  @Get('pending')
  @ApiOperation({
    summary: 'Get pending payments',
    description:
      'Authenticated. Returns paginated pending payment intents for the current user.',
  })
  @ApiResponse({ status: 200, description: 'Pending payments retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getPending(
    @Req() req: AuthenticatedRequest,
    @Query() dto: PaginationDto,
  ) {
    return this.paymentsService.getPending(req.user.id, dto);
  }

  @Get('path')
  @ApiOperation({
    summary: 'Find a payment path',
    description:
      'Authenticated. Finds an available Stellar payment path for the current user between a source and destination asset.',
  })
  @ApiQuery({ name: 'sourceAsset', required: true, description: 'Source asset code' })
  @ApiQuery({ name: 'destAsset', required: true, description: 'Destination asset code' })
  @ApiQuery({ name: 'amount', required: true, description: 'Destination amount to receive' })
  @ApiResponse({ status: 200, description: 'Payment path resolved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getPaymentPath(
    @Query('sourceAsset') sourceAsset: string,
    @Query('destAsset') destAsset: string,
    @Query('amount') amount: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.findPaymentPath(
      req.user.stellarPublicKey,
      sourceAsset,
      destAsset,
      amount,
    );
  }

  @Get(':id/status')
  @ApiOperation({
    summary: 'Get payment status',
    description:
      'Authenticated. Returns the status of a payment intent owned by the current user.',
  })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  @ApiResponse({ status: 200, description: 'Payment status retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async getStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const payment = await this.paymentsService.getPaymentById(id);
    if (payment.userId !== req.user.id) {
      throw new ForbiddenException('You do not have access to this payment');
    }

    return {
      id: payment.id,
      status: payment.status,
      expiresAt: payment.expiresAt,
    };
  }

  @Post('intent')
  @ApiOperation({
    summary: 'Create payment intent',
    description:
      'Authenticated. Creates a payment intent for an event using the selected currency or the event default currency.',
  })
  @ApiResponse({ status: 201, description: 'Payment intent created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  createIntent(
    @Body() dto: CreatePaymentIntentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.createPaymentIntent(
      dto.eventId,
      req.user.id,
      dto.currency,
      dto.usePathPayment,
      dto.sourceAsset,
    );
  }

  @Post('confirm')
  @ApiOperation({
    summary: 'Confirm payment',
    description:
      'Authenticated. Confirms a Stellar payment transaction for the current user and validates the on-chain asset and amount.',
  })
  @ApiResponse({ status: 200, description: 'Payment confirmed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  confirmPayment(
    @Body() dto: ConfirmPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.confirmPayment(dto, req.user.id);
  }
}
