import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { BruteForceGuard } from '../common/guards/brute-force.guard';
import { BruteForceService } from '../common/services/brute-force.service';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { WalletChallengeResponseDto } from './dto/wallet-challenge.dto';
import { WalletVerifyDto } from './dto/wallet-challenge.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';

@ApiTags('Auth')
@ApiResponse({ status: 429, description: 'Too many requests' })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly bruteForceService: BruteForceService,
  ) {}

  @Post('register')
  @Throttle({ global: { ttl: seconds(60), limit: 10 } })
  @Throttle({ short: { ttl: seconds(60), limit: 5 } })
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Public. Creates a new user account.',
  })
  @ApiBody({
    type: RegisterDto,
    examples: {
      standard: {
        summary: 'Standard user',
        value: { email: 'user@example.com', password: 'password123' },
      },
      admin: {
        summary: 'Admin user',
        value: {
          email: 'admin@example.com',
          password: 'password123',
          role: 'ADMIN',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Invalid request or email already exists' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @UseGuards(BruteForceGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { ttl: seconds(60), limit: 5 } })
  @Throttle({ short: { ttl: seconds(60), limit: 5 } })
  @ApiOperation({
    summary: 'Login',
    description: 'Public. Authenticates a user and returns access credentials.',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    try {
      const result = await this.authService.login(dto);
      await this.bruteForceService.reset(ip);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.bruteForceService.recordFailedAttempt(ip);
      }

      throw error;
    }
  }

  @Post('forgot-password')
  @Throttle({ global: { ttl: seconds(3600), limit: 3 } })
  @ApiOperation({
    summary: 'Request password reset email',
    description:
      'Public. Always returns success wording to avoid email enumeration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent if the account exists',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password with token',
    description:
      'Public. Resets a user password using a valid password reset token.',
  })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or used token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Public. Exchanges a valid refresh token for a new access token and refresh token pair.',
  })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout',
    description:
      'Authenticated. Revokes the provided refresh token for the current user.',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized or invalid token' })
  logout(@Body() dto: RefreshTokenDto, @Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.id, dto.refreshToken);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth redirect' })
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Req() req: any, @Res() res: any) {
    const tokens = await this.authService.findOrCreateGoogleUser(req.user);
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`;
    return res.redirect(redirectUrl);
  }

  // ─── Wallet Challenge ────────────────────────────────────────────────────────

  @Post('wallet-challenge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate wallet challenge nonce' })
  @ApiResponse({ status: 201, description: 'Nonce generated' })
  async walletChallenge(
    @Req() req: AuthenticatedRequest,
  ): Promise<WalletChallengeResponseDto> {
    const result = await this.authService.generateWalletChallenge(req.user.id);
    return { nonce: result.nonce, message: result.message };
  }

  @Post('wallet-verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify wallet challenge signature and link wallet' })
  @ApiResponse({ status: 200, description: 'Wallet linked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired nonce' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async walletVerify(
    @Req() req: AuthenticatedRequest,
    @Body() dto: WalletVerifyDto,
  ) {
    return this.authService.verifyWalletChallenge(
      req.user.id,
      dto.nonce,
      dto.signature,
      dto.publicKey,
    );
  }

  // ─── Email Verification ─────────────────────────────────────────────────────

  @Post('verify-email')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify email with token' })
  @ApiQuery({ name: 'token', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Email verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(
    @Req() req: AuthenticatedRequest,
    @Query('token') token: string,
  ) {
    return this.authService.verifyEmail(req.user.id, token);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @Throttle({ global: { ttl: seconds(3600), limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend verification email (max 3 per hour)' })
  @ApiResponse({ status: 200, description: 'Verification email resent' })
  async resendVerification(@Req() req: AuthenticatedRequest) {
    await this.authService.resendVerificationEmail(req.user.id);
    return { message: 'Verification email sent if account exists.' };
  }

  @Post('verify-email/unauthenticated')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email without authentication (from email link)' })
  @ApiResponse({ status: 200, description: 'Email verified' })
  async verifyEmailUnauthenticated(
    @Query('userId') userId: string,
    @Query('token') token: string,
  ) {
    return this.authService.verifyEmail(userId, token);
  }
}
