import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Role } from '../../common/decorators/roles.decorator';
import { MultisigService } from './multisig.service';
import { InitiatePayoutDto } from './dto/initiate-payout.dto';
import { ApproveSignatureDto } from './dto/approve-signature.dto';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';

@ApiTags('Payments - Multisig')
@ApiBearerAuth()
@Controller('payments/multisig')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MultisigController {
  constructor(private readonly multisigService: MultisigService) {}

  @Post('initiate')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(201)
  @ApiOperation({
    summary: 'Initiate a multi-signature payout',
    description: 'Create a new payout request that requires multiple coordinator approvals',
  })
  @ApiBody({ type: InitiatePayoutDto })
  @ApiResponse({ status: 201, description: 'Payout initiated' })
  @ApiResponse({ status: 400, description: 'Event not completed or invalid parameters' })
  async initiatePayout(
    @Body() dto: InitiatePayoutDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const payout = await this.multisigService.initiateMultisigPayout(
      dto,
      req.user.id,
    );

    return {
      message: 'Payout initiated successfully',
      payout,
    };
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a payout with coordinator signature',
    description: 'Admin only. Adds a signature to approve the payout',
  })
  @ApiBody({ type: ApproveSignatureDto })
  @ApiResponse({ status: 200, description: 'Signature approved' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async approvePayout(
    @Param('id') payoutId: string,
    @Body() dto: ApproveSignatureDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const payout = await this.multisigService.approvePayoutSignature(
      payoutId,
      req.user.id,
      dto.signature,
    );

    return {
      message: 'Signature approved',
      payout,
      readyToExecute: payout.status === 'approved',
    };
  }

  @Post(':id/execute')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Execute an approved multi-sig payout',
    description: 'Admin only. Executes the payout after required signatures are gathered',
  })
  @ApiResponse({ status: 200, description: 'Payout executed' })
  @ApiResponse({ status: 400, description: 'Payout not approved or execution failed' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async executePayout(
    @Param('id') payoutId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const payout = await this.multisigService.executePayout(payoutId, req.user.id);

    return {
      message: 'Payout executed successfully',
      payout,
      transactionHash: payout.transactionHash,
    };
  }

  @Get(':id')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({
    summary: 'Get payout details',
  })
  @ApiResponse({ status: 200, description: 'Payout details' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  async getPayoutById(@Param('id') payoutId: string) {
    const payout = await this.multisigService.getPayoutById(payoutId);
    return {
      payout,
      signaturesGathered: Object.keys(payout.signatures).length,
      signaturesRequired: payout.requiredSignatures,
    };
  }

  @Get('event/:eventId')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({
    summary: 'List payouts for an event',
  })
  @ApiResponse({ status: 200, description: 'List of payouts' })
  async listPayoutsByEvent(@Param('eventId') eventId: string) {
    const payouts = await this.multisigService.listPayoutsByEvent(eventId);
    return {
      eventId,
      payouts,
      total: payouts.length,
    };
  }
}
