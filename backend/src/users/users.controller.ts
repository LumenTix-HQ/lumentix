import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { Roles } from 'src/admin/roles.decorator';
import { UserRole } from './enums/user-role.enum';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.findById(req.user.id);
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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // ── Wallet ─────────────────────────────────────────────────────────────────

  @Get('wallet/balances')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all wallet balances for the authenticated user',
  })
  async getWalletBalances(@Req() req: AuthenticatedRequest) {
    return this.usersService.getWalletBalances(req.user.id);
  }

  @Get('wallet/portfolio')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get total portfolio value converted to a base currency',
  })
  @ApiQuery({ name: 'base', required: false, example: 'USD' })
  async getPortfolioValue(
    @Req() req: AuthenticatedRequest,
    @Query('base') baseCurrency: string = 'USD',
  ) {
    return this.usersService.getPortfolioValue(req.user.id, baseCurrency);
  }
}
