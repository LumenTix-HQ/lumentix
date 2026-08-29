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
import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VenuesService } from './venues.service';
import { CreateVenueLayoutDto } from './dto/create-venue-layout.dto';
import { SelectSeatDto } from './dto/select-seat.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Venues & Seats')
@Controller('events/:eventId/venues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post('layout')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create venue layout', description: 'Organizer-only. Creates a venue section with seats.' })
  @ApiResponse({ status: 201, description: 'Layout created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createLayout(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateVenueLayoutDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.venuesService.createLayout(eventId, dto, req.user.id);
  }

  @Get('layout')
  @ApiOperation({ summary: 'Get venue layout', description: 'Public. Shows venue sections for an event.' })
  @ApiResponse({ status: 200, description: 'List of sections' })
  getLayout(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.venuesService.getLayout(eventId);
  }

  @Get('sections/:sectionId/seats')
  @ApiOperation({ summary: 'Get seats in section', description: 'Public. Lists all seats in a section.' })
  @ApiResponse({ status: 200, description: 'List of seats' })
  getSeats(@Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.venuesService.getSeats(sectionId);
  }

  @Post('select-seat')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Select a seat', description: 'Authenticated user. Holds a seat for booking.' })
  @ApiResponse({ status: 201, description: 'Seat held' })
  @ApiResponse({ status: 400, description: 'Seat not available' })
  async selectSeat(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SelectSeatDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.venuesService.selectSeat(dto.seatId, dto.ticketId, req.user.id);
  }

  @Put('seats/:seatId/release')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Release seat hold', description: 'Holder or organizer. Releases a held seat.' })
  @ApiResponse({ status: 200, description: 'Seat released' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  releaseSeat(
    @Param('seatId', ParseUUIDPipe) seatId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.venuesService.releaseSeat(seatId, req.user.id);
  }

  @Get('available')
  @ApiOperation({ summary: 'Get available seats', description: 'Public. Shows all available seats for an event.' })
  @ApiResponse({ status: 200, description: 'Available seats' })
  getAvailable(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.venuesService.getAvailableSeats(eventId);
  }

  @Post('seats/:seatId/reserve')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Temporarily reserve a seat', description: 'Holds a seat while checkout is completed.' })
  reserveSeat(
    @Param('seatId', ParseUUIDPipe) seatId: string,
    @Query('durationSeconds') durationSeconds: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.venuesService.reserve_seat_temporarily(seatId, req.user.id, durationSeconds ? Number(durationSeconds) : undefined);
  }
}
