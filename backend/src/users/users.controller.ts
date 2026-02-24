import {
  Body,
  Controller,
  Get,
  Param,
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

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // ── Wallet ─────────────────────────────────────────────────────────────────

  @Get('wallet/balances')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all wallet balances for the authenticated user',
  })
  async getWalletBalances(@Req() req: AuthenticatedRequest) {
    return this.usersService.getWalletBalances(req.user.id);
  }

  @Get('wallet/portfolio')
  @UseGuards(JwtAuthGuard)
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
