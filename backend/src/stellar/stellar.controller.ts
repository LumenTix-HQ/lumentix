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
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { StellarService } from './stellar.service';

@ApiTags('Stellar')
@ApiBearerAuth()
@Controller('stellar')
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  @Get('account/:publicKey')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get Stellar account details',
    description:
      'Authenticated. Returns Stellar account information and balances for the specified public key.',
  })
  @ApiParam({ name: 'publicKey', description: 'Stellar public key' })
  @ApiResponse({ status: 200, description: 'Stellar account retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Stellar account not found' })
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
    } catch (error: any) {
      if (error?.response?.status === 404) {
        throw new NotFoundException('Stellar account not found');
      }

      throw new BadRequestException('Could not fetch account from Horizon');
    }
  }

  @Post('create-testnet-account')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({
    summary: 'Create testnet Stellar account',
    description:
      'Authenticated organizer/admin endpoint. Creates and funds a Stellar testnet account for the current user.',
  })
  @ApiResponse({ status: 201, description: 'Testnet Stellar account created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createTestnetAccount(@Req() req: AuthenticatedRequest) {
    return this.stellarService.createTestnetAccount(req.user.id);
  }
}
