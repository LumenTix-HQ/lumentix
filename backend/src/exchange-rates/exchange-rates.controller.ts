import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ExchangeRatesService } from './exchange-rates.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UpdateExchangeRateDto } from './dto/update-exchange-rate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Exchange Rates')
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create exchange rate', description: 'Admin only. Adds or updates a conversion rate between currencies.' })
  @ApiResponse({ status: 201, description: 'Rate created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@Body() createExchangeRateDto: CreateExchangeRateDto) {
    return this.exchangeRatesService.create(createExchangeRateDto);
  }

  @Get()
  @ApiOperation({ summary: 'List exchange rates', description: 'Public. Returns all configured exchange rates.' })
  @ApiResponse({ status: 200, description: 'List of rates' })
  findAll() {
    return this.exchangeRatesService.findAll();
  }

  @Get('convert')
  @ApiOperation({ summary: 'Convert currency', description: 'Public. Converts an amount from one currency to another using the latest rate.' })
  @ApiQuery({ name: 'from', required: true, description: 'Source currency code (e.g. XLM)' })
  @ApiQuery({ name: 'to', required: true, description: 'Target currency code (e.g. USD)' })
  @ApiQuery({ name: 'amount', required: true, description: 'Amount to convert (positive number)' })
  @ApiResponse({ status: 200, description: 'Conversion result' })
  @ApiResponse({ status: 400, description: 'Invalid query params' })
  async convert(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: string,
  ): Promise<{ from: string; to: string; amount: number; converted: number; rate: number }> {
    if (!from || !to || !amount) {
      throw new BadRequestException('from, to, and amount are required');
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    const rate = await this.exchangeRatesService.getRate(
      from.toUpperCase(),
      to.toUpperCase(),
    );
    return {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      amount: numAmount,
      converted: parseFloat((numAmount * rate).toFixed(7)),
      rate,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get exchange rate', description: 'Returns details for a single exchange rate entry.' })
  @ApiResponse({ status: 200, description: 'Rate found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.exchangeRatesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update exchange rate', description: 'Admin only. Updates an existing conversion rate.' })
  @ApiResponse({ status: 200, description: 'Rate updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(
    @Param('id') id: string,
    @Body() updateExchangeRateDto: UpdateExchangeRateDto,
  ) {
    return this.exchangeRatesService.update(id, updateExchangeRateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove exchange rate', description: 'Admin only. Deletes a conversion rate entry.' })
  @ApiResponse({ status: 200, description: 'Rate removed' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  remove(@Param('id') id: string) {
    return this.exchangeRatesService.remove(id);
  }
}
