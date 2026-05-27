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
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AgeVerificationService } from './age-verification.service';
import { VerifyAgeDto } from './dto/verify-age.dto';
import { SetAgeRestrictionDto } from './dto/set-age-restriction.dto';
import { AgeVerificationResponseDto } from './dto/age-verification-response.dto';

@ApiTags('Age Verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('age-verification')
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class AgeVerificationController {
  constructor(
    private readonly ageVerificationService: AgeVerificationService,
  ) {}

  @Post('verify')
  @ApiOperation({
    summary: 'Verify age for a restricted event',
    description:
      'Authenticated. Submits age verification for an event with age restrictions.',
  })
  @ApiResponse({
    status: 201,
    description: 'Age verification processed',
    type: AgeVerificationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Age requirement not met / Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async verifyAge(
    @Body() dto: VerifyAgeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AgeVerificationResponseDto> {
    return this.ageVerificationService.verifyAge(req.user.id, dto);
  }

  @Post('events/:eventId/restriction')
  @UseGuards(RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Set age restriction for an event',
    description:
      'Organizer-only. Sets or updates the age restriction for a draft event.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Age restriction updated' })
  @ApiResponse({ status: 400, description: 'Event must be in DRAFT status' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async setAgeRestriction(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SetAgeRestrictionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.ageVerificationService.setAgeRestriction(
      eventId,
      req.user.id,
      dto,
    );
  }

  @Get('events/:eventId/compliance')
  @ApiOperation({
    summary: 'Validate age compliance for an event',
    description:
      'Authenticated. Checks if the current user meets the age requirement for the specified event.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'Age compliance status',
    type: AgeVerificationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async validateCompliance(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AgeVerificationResponseDto> {
    return this.ageVerificationService.validateAgeCompliance(
      req.user.id,
      eventId,
    );
  }

  @Get('events/:eventId/status')
  @ApiOperation({
    summary: 'Get age verification status for an event',
    description:
      'Authenticated. Returns the current age verification status for the user on a specific event.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'Age verification status',
    type: AgeVerificationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getVerificationStatus(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AgeVerificationResponseDto> {
    return this.ageVerificationService.getVerificationStatus(
      req.user.id,
      eventId,
    );
  }
}
