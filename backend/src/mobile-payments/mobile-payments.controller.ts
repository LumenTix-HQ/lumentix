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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { MobilePaymentsService } from './mobile-payments.service';
import { ProcessMobilePaymentDto } from './dto/process-mobile-payment.dto';
import { HandleCallbackDto } from './dto/handle-callback.dto';
import { MobilePaymentResponseDto } from './dto/mobile-payment-response.dto';

@ApiTags('Mobile Payments')
@ApiBearerAuth()
@Controller('mobile-payments')
@UseGuards(JwtAuthGuard)
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class MobilePaymentsController {
  constructor(
    private readonly mobilePaymentsService: MobilePaymentsService,
  ) {}

  @Post('process')
  @ApiOperation({
    summary: 'Process a mobile wallet payment',
    description:
      'Authenticated. Processes a payment using Apple Pay, Google Pay, or Samsung Pay.',
  })
  @ApiResponse({
    status: 201,
    description: 'Mobile payment processed',
    type: MobilePaymentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async processPayment(
    @Body() dto: ProcessMobilePaymentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MobilePaymentResponseDto> {
    return this.mobilePaymentsService.processMobilePayment(req.user.id, dto);
  }

  @Post('callback')
  @ApiOperation({
    summary: 'Handle payment gateway callback',
    description:
      'Public/webhook endpoint for mobile wallet gateways to send payment status updates.',
  })
  @ApiResponse({
    status: 200,
    description: 'Callback processed',
    type: MobilePaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async handleCallback(
    @Body() dto: HandleCallbackDto,
  ): Promise<MobilePaymentResponseDto> {
    return this.mobilePaymentsService.handlePaymentCallback(dto);
  }

  @Get(':id/status')
  @ApiOperation({
    summary: 'Get mobile payment status',
    description:
      'Authenticated. Returns the status of a mobile wallet payment.',
  })
  @ApiParam({ name: 'id', description: 'Mobile payment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Payment status',
    type: MobilePaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async getPaymentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<MobilePaymentResponseDto> {
    return this.mobilePaymentsService.getPaymentStatus(id, req.user.id);
  }
}
