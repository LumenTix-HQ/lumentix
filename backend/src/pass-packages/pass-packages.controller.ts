import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PassPackagesService } from './pass-packages.service';
import { CreatePassPackageDto } from './dto/create-pass-package.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { Roles } from '../admin/roles.decorator';
import { RolesGuard } from '../admin/roles.guard';

@ApiTags('Pass Packages')
@Controller('pass-packages')
export class PassPackagesController {
  constructor(private passPackagesService: PassPackagesService) {}

  /**
   * Get all active pass packages
   */
  @Get()
  @ApiOperation({ summary: 'List all active pass packages' })
  @ApiResponse({
    status: 200,
    description: 'List of pass packages',
  })
  async getPassPackages(
    @Query('skip') skip = 0,
    @Query('take') take = 20,
  ) {
    return this.passPackagesService.getPassPackages(skip, take);
  }

  /**
   * Get pass package by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get pass package details' })
  @ApiResponse({
    status: 200,
    description: 'Pass package details',
  })
  async getPassPackageById(@Param('id') id: string) {
    return this.passPackagesService.getPassPackageById(id);
  }

  /**
   * Create a new pass package (Organizer/Admin only)
   */
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new pass package' })
  @ApiResponse({
    status: 201,
    description: 'Pass package created',
  })
  async createPassPackage(
    @Request() req: any,
    @Body() dto: CreatePassPackageDto,
  ) {
    return this.passPackagesService.createPassPackage(req.user, dto);
  }

  /**
   * Purchase a pass package
   */
  @Post(':id/purchase')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purchase a pass package' })
  @ApiResponse({
    status: 200,
    description: 'Pass package purchased',
  })
  async purchasePassPackage(
    @Request() req: any,
    @Param('id') packageId: string,
    @Body() body: { stellarSignature: string },
  ) {
    return this.passPackagesService.purchasePassPackage(
      req.user,
      packageId,
      body.stellarSignature,
    );
  }

  /**
   * Get user's pass packages
   */
  @Get('my-passes')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my purchased pass packages' })
  @ApiResponse({
    status: 200,
    description: 'List of user pass packages',
  })
  async getMyPassPackages(
    @Request() req: any,
    @Query('skip') skip = 0,
    @Query('take') take = 20,
  ) {
    return this.passPackagesService.getUserPassPackages(req.user.id, skip, take);
  }

  /**
   * Check pass balance
   */
  @Get(':passId/balance')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check pass balance' })
  @ApiResponse({
    status: 200,
    description: 'Pass balance information',
  })
  async checkPassBalance(@Param('passId') passId: string) {
    return this.passPackagesService.checkPassBalance(passId);
  }

  /**
   * Check if pass is eligible for specific event
   */
  @Get(':passId/check-event/:eventId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check pass eligibility for event' })
  @ApiResponse({
    status: 200,
    description: 'Pass eligibility status',
  })
  async checkEventEligibility(
    @Param('passId') passId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.passPackagesService.checkEventEligibility(passId, eventId);
  }

  /**
   * Deduct pass allowance (use the pass)
   */
  @Post(':passId/use-event/:eventId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Use pass for event (deduct allowance)' })
  @ApiResponse({
    status: 200,
    description: 'Pass allowance deducted',
  })
  async deductPassAllowance(
    @Param('passId') passId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.passPackagesService.deductPassAllowance(passId, eventId);
  }

  /**
   * Update pass package
   */
  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update pass package' })
  @ApiResponse({
    status: 200,
    description: 'Pass package updated',
  })
  async updatePassPackage(
    @Request() req: any,
    @Param('id') packageId: string,
    @Body() updates: Partial<CreatePassPackageDto>,
  ) {
    return this.passPackagesService.updatePassPackage(
      packageId,
      req.user,
      updates,
    );
  }

  /**
   * Delete pass package
   */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete pass package' })
  @ApiResponse({
    status: 200,
    description: 'Pass package deleted',
  })
  async deletePassPackage(
    @Request() req: any,
    @Param('id') packageId: string,
  ) {
    await this.passPackagesService.deletePassPackage(packageId, req.user);
    return { message: 'Pass package deleted' };
  }
}
