import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { DynamicQrService } from './dynamic-qr.service';
import { ValidateOtpDto } from './dto/validate-otp.dto';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';

@ApiTags('Tickets - Dynamic QR')
@Controller('tickets')
export class DynamicQrController {
  constructor(private readonly dynamicQrService: DynamicQrService) {}

  @Get(':id/qr/dynamic')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate a dynamic QR code for ticket validation',
    description:
      'Generates a time-based QR code that refreshes every 30 seconds to prevent screenshot reuse',
  })
  @ApiResponse({
    status: 200,
    description: 'Dynamic QR code generated successfully',
    schema: {
      example: {
        qrCodeDataUrl: 'data:image/png;base64,...',
        otp: '123456',
        expiresAt: 1624567890000,
        refreshInSeconds: 30,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  @ApiResponse({ status: 400, description: 'Ticket is not valid' })
  async generateDynamicQr(
    @Param('id') ticketId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.dynamicQrService.generateDynamicQr(ticketId, req.user.id);
    return {
      message: 'Dynamic QR code generated successfully',
      ...result,
    };
  }

  @Post('qr/validate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Validate a ticket OTP from dynamic QR code',
    description: 'Admin/organizer only. Validates the time-based OTP from the QR code',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP validation result',
    schema: {
      example: {
        valid: true,
        counter: 54321,
        message: 'OTP is valid',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async validateOtp(@Body() dto: ValidateOtpDto) {
    const result = await this.dynamicQrService.validateTimeOtp(
      dto.ticketId,
      dto.otp,
      dto.validatorTimestampMs,
    );

    return {
      message: result.valid ? 'OTP is valid' : 'OTP is invalid or expired',
      ...result,
    };
  }

  @Get('qr/sync-clock')
  @ApiOperation({
    summary: 'Sync validator clock with server',
    description: 'Calculates clock drift between validator device and server',
  })
  @ApiQuery({
    name: 'validatorTimestampMs',
    description: 'Validator device timestamp in milliseconds',
    required: true,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Clock sync information',
    schema: {
      example: {
        serverTimeMs: 1624567890000,
        driftMs: 500,
        stepSeconds: 30,
        maxDriftMs: 5000,
      },
    },
  })
  async syncValidatorClock(
    @Query('validatorTimestampMs') validatorTimestampMs: string,
    @Request() req: any,
  ) {
    const validatorIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const timestampMs = parseInt(validatorTimestampMs, 10);

    if (isNaN(timestampMs)) {
      throw new Error('Invalid validatorTimestampMs parameter');
    }

    const result = await this.dynamicQrService.syncValidatorClock(
      validatorIp,
      timestampMs,
    );

    return {
      message: 'Clock sync information retrieved',
      ...result,
    };
  }
}
