import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RequestRoleDto } from './dto/request-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { Roles } from 'src/admin/roles.decorator';
import { UserRole } from './enums/user-role.enum';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a new user',
    description: 'Admin-only endpoint to create users.',
  })
  @ApiResponse({ status: 201, description: 'User successfully created.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 403, description: 'Forbidden - Requires Admin role.' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.findById(req.user.id);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete current user account' })
  async deleteProfile(@Req() req: AuthenticatedRequest) {
    await this.usersService.deleteMyAccount(req.user.id);
    return;
  }

  @Patch('me/notification-preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update notification preferences' })
  async updateNotificationPreferences(
    @Req() req: AuthenticatedRequest,
    @Body() updateDto: UpdateNotificationPreferencesDto,
  ) {
    return this.usersService.updateNotificationPreferences(
      req.user.id,
      updateDto,
    );
  }

  @Post('me/request-role')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request a role upgrade (EVENT_GOER only)' })
  @ApiResponse({ status: 201, description: 'Role request created' })
  @ApiResponse({ status: 400, description: 'Not eligible for role upgrade' })
  @ApiResponse({ status: 409, description: 'Duplicate pending request' })
  async requestRole(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RequestRoleDto,
  ) {
    return this.usersService.requestRole(req.user.id, dto);
  }

  // ── Wallet ─────────────────────────────────────────────────────────────────

  @Get('wallet/balances')
  @ApiOperation({
    summary: 'Get all wallet balances for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'Balances retrieved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getWalletBalances(@Req() req: AuthenticatedRequest) {
    return this.usersService.getWalletBalances(req.user.id);
  }

  @Get('wallet/portfolio')
  @ApiOperation({
    summary: 'Get total portfolio value converted to a base currency',
  })
  @ApiQuery({ name: 'base', required: false, example: 'USD' })
  @ApiResponse({ status: 200, description: 'Portfolio value retrieved.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getPortfolioValue(
    @Req() req: AuthenticatedRequest,
    @Query('base') baseCurrency: string = 'USD',
  ) {
    return this.usersService.getPortfolioValue(req.user.id, baseCurrency);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Find a user by ID',
    description: 'Retrieves user details.',
  })
  @ApiResponse({ status: 200, description: 'User found.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
