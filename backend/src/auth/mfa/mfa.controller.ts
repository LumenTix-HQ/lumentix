import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MfaService } from './mfa.service';
import { UserRole } from '../../users/enums/user-role.enum';
import { Roles } from '../../admin/roles.decorator';
import { RolesGuard } from '../../admin/roles.guard';

@ApiTags('MFA')
@Controller('auth/mfa')
export class MfaController {
  constructor(private mfaService: MfaService) {}

  /**
   * Initiate TOTP MFA setup
   * Returns QR code and secret for user to scan
   */
  @Post('enable-totp/init')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize TOTP MFA setup' })
  @ApiResponse({
    status: 201,
    description: 'TOTP secret and QR code generated',
    schema: {
      properties: {
        secret: { type: 'string', description: 'Base32-encoded TOTP secret' },
        qrCode: { type: 'string', description: 'Data URL of QR code' },
        manualEntryKey: {
          type: 'string',
          description: 'Manual entry key for TOTP',
        },
      },
    },
  })
  async initiateTotpSetup(@Request() req: any) {
    const user = req.user;
    if (user.mfaConfig?.enabled) {
      throw new BadRequestException('MFA already enabled for this user');
    }

    return this.mfaService.generateTotpSecret(user);
  }

  /**
   * Verify TOTP token and enable MFA
   */
  @Post('enable-totp/verify')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify TOTP and enable MFA' })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'MFA enabled successfully',
    schema: {
      properties: {
        backupCodes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Backup codes for account recovery',
        },
      },
    },
  })
  async verifyAndEnableTotpMfa(
    @Request() req: any,
    @Body()
    body: {
      totpToken: string;
      totpSecret: string;
    },
  ) {
    const user = req.user;

    if (!body.totpToken || body.totpToken.length !== 6) {
      throw new BadRequestException('Invalid TOTP token format');
    }

    if (!body.totpSecret) {
      throw new BadRequestException('TOTP secret is required');
    }

    return this.mfaService.enableTotpMfa(user, body.totpToken, body.totpSecret);
  }

  /**
   * Enable SMS-based MFA
   */
  @Post('enable-sms')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable SMS-based MFA' })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'SMS MFA enabled, verification code sent',
    schema: {
      properties: {
        verificationCodeSent: {
          type: 'boolean',
          description: 'Whether verification code was sent',
        },
      },
    },
  })
  async enableSmsMfa(
    @Request() req: any,
    @Body() body: { phoneNumber: string },
  ) {
    const user = req.user;

    if (user.mfaConfig?.enabled) {
      throw new BadRequestException('MFA already enabled for this user');
    }

    if (!body.phoneNumber) {
      throw new BadRequestException('Phone number is required');
    }

    return this.mfaService.enableSmsMfa(user, body.phoneNumber);
  }

  /**
   * Verify MFA token (TOTP or SMS) during login
   * This endpoint requires the user to have already provided username/password
   */
  @Post('verify-token')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify MFA token during login' })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'MFA token verified',
    schema: {
      properties: {
        mfaSessionId: {
          type: 'string',
          description: 'Session ID after MFA verification',
        },
        accessToken: {
          type: 'string',
          description: 'Updated JWT with MFA verification',
        },
      },
    },
  })
  async verifyMfaToken(
    @Request() req: any,
    @Body() body: { mfaToken: string },
  ) {
    const user = req.user;

    if (!user.mfaConfig?.enabled) {
      throw new BadRequestException('MFA not enabled for this user');
    }

    if (!body.mfaToken) {
      throw new BadRequestException('MFA token is required');
    }

    let isValid = false;
    if (user.mfaConfig.method === 'totp') {
      isValid = await this.mfaService.verifyTotpToken(user, body.mfaToken);
    } else if (user.mfaConfig.method === 'sms') {
      isValid = await this.mfaService.verifySmsToken(user, body.mfaToken);
    }

    if (!isValid) {
      throw new BadRequestException('Invalid or expired MFA token');
    }

    const mfaSessionId = await this.mfaService.createMfaSession(
      user,
      user.mfaConfig.method,
    );

    return {
      mfaSessionId,
      message: 'MFA verification successful',
    };
  }

  /**
   * Get MFA status for current user
   */
  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get MFA status' })
  @ApiResponse({
    status: 200,
    description: 'Current MFA status',
    schema: {
      properties: {
        enabled: { type: 'boolean' },
        method: {
          type: 'string',
          enum: ['totp', 'sms', null],
        },
        verifiedAt: { type: 'string', nullable: true },
        backupCodesRemaining: { type: 'number' },
      },
    },
  })
  async getMfaStatus(@Request() req: any) {
    const user = req.user;
    return this.mfaService.getMfaStatus(user);
  }

  /**
   * Regenerate backup codes (requires current MFA verification)
   */
  @Post('regenerate-backup-codes')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Regenerate backup codes' })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'New backup codes generated',
    schema: {
      properties: {
        backupCodes: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async regenerateBackupCodes(@Request() req: any) {
    const user = req.user;

    if (!user.mfaConfig?.enabled) {
      throw new BadRequestException('MFA not enabled for this user');
    }

    const backupCodes = await this.mfaService.regenerateBackupCodes(user);
    return { backupCodes };
  }

  /**
   * Disable MFA
   */
  @Delete('disable')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable MFA' })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: 'MFA disabled successfully',
  })
  async disableMfa(@Request() req: any) {
    const user = req.user;

    if (!user.mfaConfig?.enabled) {
      throw new BadRequestException('MFA not enabled for this user');
    }

    await this.mfaService.disableMfa(user);
    return { message: 'MFA disabled successfully' };
  }
}
