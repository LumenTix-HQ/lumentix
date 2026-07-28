import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResaleService } from './resale.service';
import {
  MarketplaceQueryDto,
  MarketplaceResponseDto,
} from './dto/marketplace-query.dto';

/**
 * Public resale marketplace (issue #861).
 *
 * A separate controller from `ResaleController` on purpose. That one applies
 * `@UseGuards(JwtAuthGuard)` at class level, so every route under it requires a
 * token. Browsing what is for sale must not — a prospective buyer has no
 * account yet, and requiring one to see inventory is backwards.
 *
 * The alternative was adding a `@Public()` decorator and teaching the shared
 * JwtAuthGuard to honour it. That changes the default for every guarded route
 * in the application to opt-out rather than opt-in, which is a much larger
 * blast radius than this issue warrants. An explicitly unguarded controller
 * keeps the public surface visible in one file.
 */
@ApiTags('Resale Marketplace')
@Controller('resale/marketplace')
export class ResaleMarketplaceController {
  constructor(private readonly resaleService: ResaleService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse active resale listings',
    description:
      'Public and paginated. Returns tickets currently listed for resale, newest first. ' +
      'Filter by event with ?eventId=. Responses are cached for 60 seconds.',
  })
  @ApiResponse({ status: 200, description: 'Paginated active resale listings' })
  async list(@Query() query: MarketplaceQueryDto): Promise<MarketplaceResponseDto> {
    return this.resaleService.getMarketplaceListings(query);
  }
}
