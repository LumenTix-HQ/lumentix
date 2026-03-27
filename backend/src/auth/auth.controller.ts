import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ short: { ttl: seconds(60), limit: 5 } }) // 5 per minute on auth
  @ApiOperation({ summary: 'Register a new user', description: 'Creates a new user account.' })
  @ApiBody({ 
    type: RegisterDto, 
    examples: {
      standard: { summary: 'Standard user', value: { email: 'user@example.com', password: 'password123' } },
      admin: { summary: 'Admin user', value: { email: 'admin@example.com', password: 'password123', role: 'ADMIN' } }
    }
  })
  @ApiResponse({ status: 201, description: 'User successfully registered.' })
  @ApiResponse({ status: 400, description: 'Bad Request / Email already exists.' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: seconds(60), limit: 5 } }) // 5 per minute on auth
  @ApiOperation({ summary: 'Login', description: 'Authenticate user and return a JWT access token.' })
  @ApiResponse({ status: 200, description: 'Login successful.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
