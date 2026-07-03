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
import { WalletVerifyDto } from './dto/wallet-verify.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestWalletChallengeDto } from './dto/request-wallet-challenge.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user with email/password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'JWT tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Req() req: AuthenticatedRequest) {
    return this.authService.login(req.user as any);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if email exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address with token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login or link wallet with signed challenge' })
  async walletLogin(@Body() dto: { publicKey: string; signature: string }) {
    return this.authService.walletLogin(dto.publicKey, dto.signature);
  }

  // ─── Google OAuth ────────────────────────────────────────────────────────
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

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Redirect to Google for authentication' })
  async googleAuth() {
    // This route will redirect to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Handle Google authentication callback' })
  async googleAuthRedirect(@Req() req: AuthenticatedRequest) {
    return this.authService.login(req.user as any);
  }
}