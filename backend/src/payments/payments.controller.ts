import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('intent')
  @ApiOperation({ summary: 'Create payment intent', description: 'Initiates an escrow payment for an event ticket.' })
  @ApiBody({
    type: CreatePaymentIntentDto,
    examples: {
      example1: { summary: 'Standard Intent', value: { eventId: '123e4567-e89b-12d3-a456-426614174000' } }
    }
  })
  @ApiResponse({ status: 201, description: 'Payment intent created.' })
  @ApiResponse({ status: 400, description: 'Invalid event or sold out.' })
  createIntent(
    @Body() dto: CreatePaymentIntentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.createPaymentIntent(dto.eventId, req.user.id);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm payment', description: 'Confirms a payment using the Stellar transaction hash.' })
  @ApiResponse({ status: 200, description: 'Payment confirmed and ticket issued.' })
  @ApiResponse({ status: 400, description: 'Invalid transaction hash or payment mismatch.' })
  confirmPayment(
    @Body() dto: ConfirmPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.confirmPayment(
      dto.transactionHash,
      req.user.id,
    );
  }
}
