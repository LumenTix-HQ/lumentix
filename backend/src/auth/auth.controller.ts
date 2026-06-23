import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
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
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { WalletChallengeResponseDto } from './dto/wallet-challenge.dto';
import { WalletVerifyDto } from './dto/wallet-challenge.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ global: { ttl: seconds(60), limit: 10 } })
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
  @Throttle({ default: { limit: 10, ttl: 900_000 } }) // 10 per 15 min
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 900_000 } }) // 10 per 15 min
  @HttpCode(HttpStatus.OK)
  @Throttle({ global: { ttl: seconds(60), limit: 5 } })
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
  @ApiOperation({ summary: 'Authenticate user with email/password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'JWT tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })    async login(@Req() req: AuthenticatedRequest) {
    return this.authService.login(req.user as any);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 10, ttl: 900_000 } }) // 10 per 15 min
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if email exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } }) // 3 per hour
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('refresh')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'New JWT tokens' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Req() req: AuthenticatedRequest, @Body() dto: RefreshTokenDto) {
    await this.authService.logout(req.user.id, dto?.refreshToken);
    return { message: 'Logged out' };
  }

  // ── Email verification ──────────────────────────────────────────────────

  @Post('verify-email')
  @Throttle({ default: { limit: 5, ttl: 900_000 } }) // 5 per 15 min
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address with token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } }) // 3 per hour
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  // ── Wallet challenge ────────────────────────────────────────────────────

  @Post('wallet-challenge')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a wallet signing challenge' })
  async requestWalletChallenge(@Body() dto: RequestWalletChallengeDto) {
    return this.authService.requestWalletChallenge(dto.publicKey);
  }

  @Post('wallet-login')
  @Throttle({ default: { limit: 10, ttl: 900_000 } }) // 10 per 15 min
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login or link wallet with signed challenge' })
  async walletLogin(@Body() dto: { publicKey: string; signature: string }) {
    return this.authService.walletLogin(dto.publicKey, dto.signature);
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
