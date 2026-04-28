import { Body, Controller, Post, HttpCode, HttpStatus, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { BruteForceService } from '../common/services/brute-force.service';
import { BruteForceGuard } from '../common/guards/brute-force.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly bruteForceService: BruteForceService,
  ) {}

  @Post('register')
  @Throttle({ short: { ttl: seconds(60), limit: 5 } }) // 5 per minute on auth
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Creates a new user account.',
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
  @ApiResponse({ status: 201, description: 'User successfully registered.' })
  @ApiResponse({
    status: 400,
    description: 'Bad Request / Email already exists.',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @UseGuards(BruteForceGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: seconds(60), limit: 5 } }) // 5 per minute on auth
  @ApiOperation({
    summary: 'Login',
    description: 'Authenticate user and return a JWT access token.',
  })
  @ApiResponse({ status: 200, description: 'Login successful.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    try {
      const result = await this.authService.login(dto);
      await this.bruteForceService.reset(ip);
      return result;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await this.bruteForceService.recordFailedAttempt(ip);
      }

      throw err;
    }
  }

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request password reset email',
    description: 'Always returns 200 to avoid email enumeration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent if account exists.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful.' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or used token.' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and get new access token' })
  @ApiResponse({ status: 200, description: 'New token pair issued.' })
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Exchange a valid refresh token for a new access token and refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token.' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out.' })
  async logout(@Body() dto: RefreshTokenDto, @Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.id, dto.refreshToken);
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout',
    description: 'Revoke the current refresh token.',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized or invalid token.' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out successfully.' };
  }
}
