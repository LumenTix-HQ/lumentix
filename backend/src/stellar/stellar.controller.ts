import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StellarService } from './stellar.service';

@ApiTags('Stellar')
@Controller('stellar')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  @Get('account/:publicKey')
  @ApiOperation({ summary: 'Get Stellar account info and balances' })
  @ApiResponse({
    status: 200,
    description: 'Stellar account information returned successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid public key or Horizon error',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Stellar account not found' })
  async getAccount(@Param('publicKey') publicKey: string) {
    if (!/^G[A-Z2-7]{55}$/.test(publicKey)) {
      throw new BadRequestException('Invalid Stellar public key format');
    }

    try {
      const account = await this.stellarService.getAccount(publicKey);
      return {
        publicKey: account.id,
        sequence: account.sequence,
        balances: account.balances,
        lastModifiedLedger: account.last_modified_ledger,
      };
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) {
        throw new NotFoundException('Stellar account not found');
      }

      throw new BadRequestException('Could not fetch account from Horizon');
    }
  }
}
