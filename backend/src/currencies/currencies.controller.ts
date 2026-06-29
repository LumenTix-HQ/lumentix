import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

import { CurrencyRateService }
  from './services/currency-rate.service';

@ApiTags('Currencies')
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

    @Get('rates')
  async getRates(
    @Res({ passthrough: true })
    response: Response,
  ) {
    const result =
      await this.currencyRateService.getRates();

    if (result.stale) {
      response.setHeader(
        'X-Rate-Stale',
        'true',
      );
    }

    return result.data;
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create currency', description: 'Admin only. Adds a new supported currency for the marketplace.' })
  @ApiResponse({ status: 201, description: 'Currency created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@Body() createCurrencyDto: CreateCurrencyDto) {
    return this.currenciesService.create(createCurrencyDto);
  }

  @Get()
  @ApiOperation({ summary: 'List currencies', description: 'Public. Returns all supported currencies.' })
  @ApiResponse({ status: 200, description: 'List of currencies' })
  findAll() {
    return this.currenciesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get currency', description: 'Returns details for a single currency.' })
  @ApiResponse({ status: 200, description: 'Currency found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.currenciesService.findOne(id);
  }

  @Patch(':id/toggle-active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle currency active status', description: 'Admin only. Enables or disables a currency without deleting it.' })
  @ApiResponse({ status: 200, description: 'Currency active status toggled' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  toggleActive(@Param('id') id: string) {
    return this.currenciesService.toggleActive(id);
  }

  @Patch(':code/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate a currency', description: 'Admin only. Activates a currency by its code.' })
  @ApiResponse({ status: 200, description: 'Currency activated' })
  @ApiResponse({ status: 404, description: 'Currency not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  activate(@Param('code') code: string) {
    return this.currenciesService.activate(code);
  }

  @Patch(':code/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a currency', description: 'Admin only. Deactivates a currency. Returns 409 if pending payments exist for this currency.' })
  @ApiResponse({ status: 200, description: 'Currency deactivated' })
  @ApiResponse({ status: 404, description: 'Currency not found' })
  @ApiResponse({ status: 409, description: 'Conflict — pending payments exist' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  deactivate(@Param('code') code: string) {
    return this.currenciesService.deactivate(code);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update currency', description: 'Admin only. Updates existing currency configuration.' })
  @ApiResponse({ status: 200, description: 'Currency updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(
    @Param('id') id: string,
    @Body() updateCurrencyDto: UpdateCurrencyDto,
  ) {
    return this.currenciesService.update(id, updateCurrencyDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove currency', description: 'Admin only. Deletes a currency from the platform.' })
  @ApiResponse({ status: 200, description: 'Currency removed' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  remove(@Param('id') id: string) {
    return this.currenciesService.remove(id);
  }
}
