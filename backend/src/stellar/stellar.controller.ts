import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { StellarService } from './stellar.service';
import { UsersService } from '../users/users.service';

@ApiTags('Stellar')
@Controller('stellar')
export class StellarController {
  constructor(
    private readonly stellarService: StellarService,
    private readonly usersService: UsersService,
  ) {}

  @Get('account/:publicKey')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Stellar account info and balances' })
  async getAccount(@Param('publicKey') publicKey: string) {
    if (!/^G[A-Z2-7]{55}$/.test(publicKey)) {
      throw new BadRequestException('Invalid Stellar public key');
    }
    try {
      const account = await this.stellarService.getAccount(publicKey);
      return {
        publicKey: account.id,
        sequence: account.sequence,
        balances: account.balances,
      };
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new NotFoundException('Stellar account not found');
      }
      throw new BadRequestException('Could not fetch account from Horizon');
    }
  }

  @Post('create-testnet-account')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create and fund a testnet Stellar account (testnet only)',
  })
  async createTestnetAccount(@Req() req: AuthenticatedRequest) {
    return this.stellarService.createTestnetAccount(req.user.id);
  }
}
