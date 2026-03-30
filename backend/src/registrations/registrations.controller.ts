import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { RegistrationsService } from './registrations.service';
import { ListRegistrationsDto } from './dto/list-registrations.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller()
@UseGuards(RolesGuard)
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Post('events/:id/register')
  async register(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const result = await this.service.register(eventId, req.user.id);
    return res.status(result.httpStatus).json(
      result.waitlistPosition !== undefined
        ? { status: 'waitlisted', position: result.waitlistPosition, registration: result.registration }
        : result.registration,
    );
  }

  @Get('events/:id/registrations')
  @Roles(Role.ORGANIZER)
  listForEvent(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Query() dto: ListRegistrationsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listForEvent(eventId, req.user.id, dto);
  }

  @Get('users/me/registrations')
  listMine(@Query() dto: ListRegistrationsDto, @Req() req: AuthenticatedRequest) {
    return this.service.listForUser(req.user.id, dto);
  }

  @Delete('registrations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.cancel(id, req.user.id);
  }

  @Delete('events/:eventId/registrations/:registrationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelWithRefund(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.cancelWithRefund(eventId, registrationId, req.user.id);
  }
}
