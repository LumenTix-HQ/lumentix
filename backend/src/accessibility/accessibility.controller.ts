import { Controller, Get, Post, Put, Body, Param, UseGuards, Req, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AccessibilityService } from './accessibility.service';
import { SetupAccessibilityInventoryDto } from './dto/setup-accessibility-inventory.dto';
import { RequestAccessibilityBookingDto } from './dto/request-accessibility-booking.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Accessibility')
@Controller('events/:eventId/accessibility')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccessibilityController {
  constructor(private readonly accessibilityService: AccessibilityService) {}

  @Put('inventory')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Setup accessibility inventory', description: 'Organizer-only. Configures accessibility accommodations.' })
  @ApiResponse({ status: 200, description: 'Inventory updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  setupInventory(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SetupAccessibilityInventoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.accessibilityService.setupInventory(eventId, dto, req.user.id);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Get accessibility inventory', description: 'Public. Shows available accessibility accommodations.' })
  @ApiResponse({ status: 200, description: 'List of inventory' })
  getInventory(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.accessibilityService.getInventory(eventId);
  }

  @Post('book')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Book accessibility accommodation', description: 'Organizer-only. Assigns accommodation to a ticket.' })
  @ApiResponse({ status: 201, description: 'Booking created' })
  @ApiResponse({ status: 400, description: 'No slots or invalid ticket' })
  requestBooking(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: RequestAccessibilityBookingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.accessibilityService.requestBooking(eventId, dto, req.user.id);
  }

  @Get('bookings')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List accessibility bookings', description: 'Organizer-only. Shows all bookings for an event.' })
  @ApiResponse({ status: 200, description: 'List of bookings' })
  getBookings(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.accessibilityService.getBookings(eventId);
  }

  @Get('bookings/:id')
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get booking by ID', description: 'Organizer-only. Gets a single booking details.' })
  @ApiResponse({ status: 200, description: 'Booking found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  getBooking(@Param('id', ParseUUIDPipe) id: string) {
    return this.accessibilityService.getBookingById(id);
  }
}
