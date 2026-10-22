import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { BridgeService } from './bridge.service';
import { InitiateBridgeTransferDto } from './dto/initiate-bridge-transfer.dto';
import { BridgeTransferResponseDto } from './dto/bridge-transfer-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('bridge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bridge')
export class BridgeController {
  constructor(private readonly bridgeService: BridgeService) {}

  /**
   * Initiate a cross-chain bridge transfer for a ticket NFT (#1463).
   * Creates a PENDING transfer record and returns the envelope the caller
   * uses to drive subsequent lock / mint steps.
   */
  @Post('transfers')
  @ApiOperation({
    summary: 'Initiate a cross-chain bridge transfer for a ticket NFT',
  })
  @ApiBody({ type: InitiateBridgeTransferDto })
  @ApiResponse({
    status: 201,
    description: 'Transfer record created in PENDING state.',
    type: BridgeTransferResponseDto,
  })
  initiateBridgeTransfer(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InitiateBridgeTransferDto,
  ): Promise<BridgeTransferResponseDto> {
    return this.bridgeService.initiateBridgeTransfer(req.user.id, dto);
  }

  /**
   * Lock the source-chain token (step 2 of the bridge pipeline, #1463).
   * Transitions the transfer to SOURCE_LOCKED and records the on-chain hash.
   */
  @Post('transfers/:id/lock')
  @ApiOperation({
    summary: 'Lock the source-chain ticket token (step 2 of bridge pipeline)',
  })
  @ApiParam({ name: 'id', description: 'Bridge transfer UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        signedLockTxXdr: {
          type: 'string',
          description: 'Pre-signed Stellar XDR (or equivalent) for the lock transaction.',
        },
      },
    },
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Transfer transitioned to SOURCE_LOCKED.',
    type: BridgeTransferResponseDto,
  })
  lockSourceToken(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('signedLockTxXdr') signedLockTxXdr?: string,
  ): Promise<BridgeTransferResponseDto> {
    return this.bridgeService.lockSourceToken(id, req.user.id, signedLockTxXdr);
  }

  /**
   * Mint the bridged token on the destination chain (step 3, #1463).
   * Transitions the transfer to COMPLETED and records the mint hash.
   */
  @Post('transfers/:id/mint')
  @ApiOperation({
    summary: 'Mint the bridged ticket token on the destination chain (step 3)',
  })
  @ApiParam({ name: 'id', description: 'Bridge transfer UUID' })
  @ApiResponse({
    status: 200,
    description: 'Transfer completed; mint hash recorded.',
    type: BridgeTransferResponseDto,
  })
  mintBridgedToken(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BridgeTransferResponseDto> {
    return this.bridgeService.mintBridgedToken(id, req.user.id);
  }

  /**
   * List all bridge transfers for the authenticated user.
   */
  @Get('transfers/me')
  @ApiOperation({ summary: 'List my bridge transfers' })
  @ApiResponse({
    status: 200,
    description: 'All bridge transfers for the authenticated user.',
    type: [BridgeTransferResponseDto],
  })
  getMyTransfers(
    @Req() req: AuthenticatedRequest,
  ): Promise<BridgeTransferResponseDto[]> {
    return this.bridgeService.getTransfersForUser(req.user.id);
  }

  /**
   * Get any single bridge transfer by id (admin only).
   */
  @Get('transfers/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a bridge transfer by id (admin only)' })
  @ApiParam({ name: 'id', description: 'Bridge transfer UUID' })
  @ApiResponse({
    status: 200,
    description: 'The requested bridge transfer.',
    type: BridgeTransferResponseDto,
  })
  getTransferById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BridgeTransferResponseDto> {
    return this.bridgeService.getTransferById(id);
  }
}
