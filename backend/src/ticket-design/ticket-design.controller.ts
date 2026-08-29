import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TicketDesignService } from './ticket-design.service';
import { SaveTicketDesignDto } from './dto/save-ticket-design.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Ticket Design')
@Controller('events/:eventId/ticket-designs')
export class TicketDesignController {
  constructor(private readonly ticketDesignService: TicketDesignService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save a new ticket design', description: 'Organizer-only. Creates a custom ticket visual layout with background, colors, and logo.' })
  @ApiResponse({ status: 201, description: 'Ticket design saved' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SaveTicketDesignDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ticketDesignService.saveTicketDesign(eventId, dto, req.user.id);
  }

  @Put(':designId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an existing ticket design', description: 'Organizer-only. Updates an existing design.' })
  @ApiResponse({ status: 200, description: 'Ticket design updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('designId', ParseUUIDPipe) designId: string,
    @Body() dto: SaveTicketDesignDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ticketDesignService.saveTicketDesign(eventId, dto, req.user.id, designId);
  }

  @Get()
  @ApiOperation({ summary: 'List ticket designs', description: 'Public. Lists all saved ticket designs for an event.' })
  @ApiResponse({ status: 200, description: 'List of ticket designs' })
  list(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.ticketDesignService.listDesigns(eventId);
  }

  @Get(':designId/render')
  @ApiOperation({ summary: 'Render a ticket layout', description: 'Public. Compiles a saved design into a render-ready layout with resolved background CSS.' })
  @ApiResponse({ status: 200, description: 'Rendered ticket layout' })
  render(@Param('designId', ParseUUIDPipe) designId: string) {
    return this.ticketDesignService.renderTicketLayout(designId);
  }

  @Get('themes')
  @ApiOperation({ summary: 'Compile all design themes', description: 'Public. Compiles every saved design for an event into ready-to-preview themes.' })
  @ApiResponse({ status: 200, description: 'Compiled design themes' })
  compileThemes(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.ticketDesignService.compileDesignThemes(eventId);
  }
}
