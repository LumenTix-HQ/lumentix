import {
  BadRequestException,
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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { ChallengeRequestDto } from './dto/challenge-request.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('challenge')
  @ApiOperation({ summary: 'Request wallet challenge', description: 'Public. Returns a nonce-based message for a public key to sign.' })
  @ApiResponse({ status: 201, description: 'Challenge returned' })
  async requestChallenge(
    @Body() dto: ChallengeRequestDto,
  ): Promise<{ message: string }> {
    return this.walletService.requestChallenge(dto.publicKey);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify and link wallet', description: 'Verifies the signature and links the Stellar public key to the user account.' })
  @ApiResponse({ status: 201, description: 'Wallet verified and linked' })
  @ApiResponse({ status: 400, description: 'Invalid signature' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async verify(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VerifySignatureDto,
  ) {
    const { id: userId } = req.user;
    return this.walletService.verifyAndLink(userId, dto.publicKey, dto.signature);
  }

  // ── Issue 157 ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet status', description: 'Returns whether the user has a linked wallet and its public key.' })
  @ApiResponse({ status: 200, description: 'Wallet status returned' })
  async getStatus(@Req() req: AuthenticatedRequest) {
    return this.walletService.getWalletStatus(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('unlink')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlink wallet', description: 'Removes the linked Stellar wallet from the user account.' })
  @ApiResponse({ status: 200, description: 'Wallet unlinked' })
  @ApiResponse({ status: 400, description: 'No wallet is currently linked' })
  async unlink(@Req() req: AuthenticatedRequest) {
    return this.walletService.unlinkWallet(req.user.id);
  }

  // ── Issue 158 ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('list')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all linked wallets', description: 'Returns all Stellar wallets linked to the user account.' })
  @ApiResponse({ status: 200, description: 'Wallet list returned' })
  async listWallets(@Req() req: AuthenticatedRequest) {
    return this.walletService.listWallets(req.user.id);
  }

  // ── Issue 159 ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction history', description: 'Returns paginated Stellar transaction history for the linked wallet.' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Paging cursor from previous response' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of records to return (max 50, default 10)' })
  @ApiResponse({ status: 200, description: 'Transaction history returned' })
  @ApiResponse({ status: 400, description: 'No wallet linked' })
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 10,
  ) {
    const status = await this.walletService.getWalletStatus(req.user.id);
    if (!status.publicKey) {
      throw new BadRequestException('No wallet linked');
    }
    return this.walletService.getTransactionHistory(status.publicKey, cursor, Number(limit));
  }

  // ── Issue 158 (continued — these must come after /transactions to avoid route shadowing) ──

  @UseGuards(JwtAuthGuard)
  @Patch(':publicKey/primary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set primary wallet', description: 'Designates a linked wallet as the primary wallet.' })
  @ApiResponse({ status: 200, description: 'Primary wallet updated' })
  @ApiResponse({ status: 400, description: 'Wallet not found' })
  async setPrimary(
    @Req() req: AuthenticatedRequest,
    @Param('publicKey') publicKey: string,
  ) {
    return this.walletService.setPrimaryWallet(req.user.id, publicKey);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':publicKey')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a wallet', description: 'Removes a specific linked wallet. Cannot remove primary wallet when other wallets exist.' })
  @ApiResponse({ status: 200, description: 'Wallet removed' })
  @ApiResponse({ status: 400, description: 'Cannot remove primary wallet or wallet not found' })
  async removeWallet(
    @Req() req: AuthenticatedRequest,
    @Param('publicKey') publicKey: string,
  ) {
    return this.walletService.removeWallet(req.user.id, publicKey);
  }
}
