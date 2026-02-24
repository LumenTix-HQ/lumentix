import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(Role.ORGANIZER)
  create(@Body() dto: CreateEventDto, @Req() req: AuthenticatedRequest) {
    return this.eventsService.createEvent(dto, req.user.id);
  }

  @Get()
  list(@Query() filterDto: ListEventsDto) {
    return this.eventsService.listEvents(filterDto);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.getEventById(id);
  }

  @Put(':id')
  @Roles(Role.ORGANIZER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: AuthenticatedRequest, // ← add
  ) {
    return this.eventsService.updateEvent(id, dto, req.user.id); // ← pass callerId
  }

  @Delete(':id')
  @Roles(Role.ORGANIZER)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.eventsService.deleteEvent(id, req.user.id); // ← pass callerId
  }
}
