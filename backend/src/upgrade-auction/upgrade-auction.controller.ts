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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UpgradeAuctionService } from './upgrade-auction.service';
import { OpenUpgradeAuctionDto } from './dto/open-upgrade-auction.dto';
import { PlaceUpgradeBidDto } from './dto/place-upgrade-bid.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Seat Upgrade Auctions')
@Controller()
export class UpgradeAuctionController {
  constructor(private readonly upgradeAuctionService: UpgradeAuctionService) {}

  @Post('events/:eventId/upgrade-auctions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Open a premium seat upgrade auction', description: 'Organizer-only. Opens a transparent auction for a limited number of premium seat upgrades.' })
  @ApiResponse({ status: 201, description: 'Auction opened' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  open(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: OpenUpgradeAuctionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.upgradeAuctionService.openUpgradeAuction(eventId, dto, req.user.id);
  }

  @Get('events/:eventId/upgrade-auctions')
  @ApiOperation({ summary: 'List upgrade auctions', description: 'Public. Lists premium seat upgrade auctions for an event.' })
  @ApiResponse({ status: 200, description: 'List of upgrade auctions' })
  list(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.upgradeAuctionService.listAuctions(eventId);
  }

  @Get('upgrade-auctions/:id/bids')
  @ApiOperation({ summary: 'List bids for an auction', description: 'Public. Provides transparency into current bidding activity.' })
  @ApiResponse({ status: 200, description: 'List of bids, highest first' })
  listBids(@Param('id', ParseUUIDPipe) id: string) {
    return this.upgradeAuctionService.listBidsForAuction(id);
  }

  @Post('upgrade-auctions/:id/bids')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Place a bid on a seat upgrade auction', description: 'Ticket holder-only. Bid must exceed the current highest bid by the minimum increment.' })
  @ApiResponse({ status: 201, description: 'Bid placed' })
  @ApiResponse({ status: 400, description: 'Auction closed or bid too low' })
  placeBid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlaceUpgradeBidDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.upgradeAuctionService.placeUpgradeBid(id, dto, req.user.id);
  }

  @Post('upgrade-auctions/:id/finalize')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Finalize a seat upgrade auction', description: 'Organizer-only. Closes bidding and awards the top bids up to the available slots.' })
  @ApiResponse({ status: 200, description: 'Auction finalized with winning bids' })
  finalize(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.upgradeAuctionService.finalizeWinningBid(id, req.user.id);
  }
}
