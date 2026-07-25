import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/roles.guard';
import { Roles } from '../admin/roles.decorator';
import {
  CalculateTaxDto,
  ExportTaxReportDto,
  RecordTaxCollectionDto,
  RegisterTaxRuleDto,
} from './dto/tax.dto';
import { TaxService } from './tax.service';

@ApiTags('tax')
@Controller('tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  // ── Tax Rules ─────────────────────────────────────────────────────────────

  @Post('rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register or update a tax rule (admin only)' })
  async registerRule(@Body() dto: RegisterTaxRuleDto) {
    return this.taxService.registerTaxRule(dto);
  }

  @Get('rules')
  @ApiOperation({ summary: 'List all tax rules' })
  async listRules() {
    return this.taxService.listTaxRules();
  }

  @Get('rules/:jurisdictionCode')
  @ApiOperation({ summary: 'Get tax rule for a specific jurisdiction' })
  async getRule(@Param('jurisdictionCode') code: string) {
    return this.taxService.getTaxRule(code);
  }

  // ── Tax Calculation ───────────────────────────────────────────────────────

  @Post('calculate')
  @ApiOperation({
    summary: 'Calculate ticket sales tax for a given jurisdiction',
    description:
      'Returns the tax breakdown (base price, tax amount, total) without persisting anything.',
  })
  async calculateTax(@Body() dto: CalculateTaxDto) {
    return this.taxService.calculateTicketSalesTax(dto);
  }

  // ── Tax Collection Recording ──────────────────────────────────────────────

  @Post('collect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record a tax collection event after a ticket purchase',
  })
  async recordCollection(
    @Body() dto: RecordTaxCollectionDto,
    @Query('basePrice') basePrice: string,
  ) {
    const price = parseInt(basePrice, 10);
    if (!price || price <= 0) {
      throw new Error('basePrice query param must be a positive integer');
    }
    return this.taxService.recordTaxCollection(dto, price);
  }

  @Get('collect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tax collection records (admin only)' })
  @ApiQuery({ name: 'jurisdictionCode', required: false })
  @ApiQuery({ name: 'eventId', required: false })
  async listCollections(
    @Query('jurisdictionCode') jurisdictionCode?: string,
    @Query('eventId') eventId?: string,
  ) {
    return this.taxService.listTaxCollectionRecords(jurisdictionCode, eventId);
  }

  @Get('collect/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single tax collection record' })
  async getCollection(@Param('id') id: string) {
    return this.taxService.getTaxCollectionRecord(id);
  }

  // ── Tax Reports ───────────────────────────────────────────────────────────

  @Post('reports/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export a tax report for a jurisdiction over a time window (admin only)',
  })
  async exportReport(@Body() dto: ExportTaxReportDto, @Request() req: any) {
    return this.taxService.exportTaxReports(dto, req.user?.id ?? 'system');
  }

  @Get('reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all tax reports (admin only)' })
  @ApiQuery({ name: 'jurisdictionCode', required: false })
  async listReports(@Query('jurisdictionCode') jurisdictionCode?: string) {
    return this.taxService.listTaxReports(jurisdictionCode);
  }

  @Get('reports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific tax report (admin only)' })
  async getReport(@Param('id') id: string) {
    return this.taxService.getTaxReport(id);
  }

  // ── Jurisdiction Resolution ───────────────────────────────────────────────

  @Get('resolve')
  @ApiOperation({
    summary: 'Resolve the applicable tax jurisdiction for a country/state',
  })
  @ApiQuery({ name: 'countryCode', required: true, example: 'US' })
  @ApiQuery({ name: 'stateCode', required: false, example: 'CA' })
  async resolveJurisdiction(
    @Query('countryCode') countryCode: string,
    @Query('stateCode') stateCode?: string,
  ) {
    return this.taxService.resolveJurisdiction(countryCode, stateCode);
  }
}
