import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { ListVenuesDto } from './dto/list-venues.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Venues')
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  @ApiOperation({ summary: 'Browse active venues' })
  @ApiResponse({ status: 200, description: 'Paginated list of venues.' })
  listVenues(@Query() dto: ListVenuesDto) {
    return this.venuesService.listVenues(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a venue by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Venue details.' })
  @ApiResponse({ status: 404, description: 'Venue not found.' })
  getVenue(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.getVenue(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Register a new venue (organizer / admin)' })
  @ApiResponse({ status: 201, description: 'Venue created.' })
  createVenue(
    @Body() dto: CreateVenueDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.venuesService.createVenue(dto, req.user.id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a venue (owner or admin)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Venue updated.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  updateVenue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVenueDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user.role === Role.ADMIN;
    return this.venuesService.updateVenue(id, dto, req.user.id, isAdmin);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a venue (owner or admin)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Venue deleted.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  deleteVenue(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.user.role === Role.ADMIN;
    return this.venuesService.deleteVenue(id, req.user.id, isAdmin);
  }
}
