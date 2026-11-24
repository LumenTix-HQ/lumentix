import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { TaxReceiptsService } from './tax-receipts.service';
import { GenerateTaxReceiptDto } from './dto/generate-tax-receipt.dto';
import { TaxReceiptResponseDto } from './dto/tax-receipt-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('tax-receipts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tax-receipts')
export class TaxReceiptsController {
  constructor(private readonly taxReceiptsService: TaxReceiptsService) {}

  /**
   * Generate a region-specific tax receipt for a confirmed payment (#1464).
   *
   * Applies regional tax rules (VAT / GST / sales tax), builds a PDF, and
   * optionally emails it if `recipientEmail` is provided.
   */
  @Post()
  @ApiOperation({
    summary: 'Generate a tax receipt / invoice for a confirmed ticket purchase',
  })
  @ApiBody({ type: GenerateTaxReceiptDto })
  @ApiResponse({
    status: 201,
    description: 'Receipt generated and optionally emailed.',
    type: TaxReceiptResponseDto,
  })
  generateTaxReceipt(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateTaxReceiptDto,
  ): Promise<TaxReceiptResponseDto> {
    return this.taxReceiptsService.generateTaxReceipt(req.user.id, dto);
  }

  /**
   * List all tax receipts for the authenticated user.
   */
  @Get('me')
  @ApiOperation({ summary: 'List all tax receipts for the current user' })
  @ApiResponse({
    status: 200,
    description: 'All tax receipts for the authenticated user.',
    type: [TaxReceiptResponseDto],
  })
  getMyReceipts(
    @Req() req: AuthenticatedRequest,
  ): Promise<TaxReceiptResponseDto[]> {
    return this.taxReceiptsService.getReceiptsForUser(req.user.id);
  }

  /**
   * Download a generated receipt as a PDF file (#1551).
   *
   * The PDF is rebuilt from the stored line-item data so the download works
   * even when no external storage adapter is configured.
   */
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Download a tax receipt as a PDF' })
  @ApiParam({ name: 'id', description: 'Tax receipt UUID' })
  @ApiResponse({ status: 200, description: 'The receipt PDF file.' })
  async downloadTaxReceiptPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const { buffer, fileName } =
      await this.taxReceiptsService.downloadTaxReceiptPdf(req.user.id, id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  /**
   * Re-send a previously generated tax receipt to an email address (#1464).
   *
   * Useful when the original email was lost or when the user wants a copy
   * forwarded to their accountant.
   */
  @Post(':id/email')
  @ApiOperation({ summary: 'Email a previously generated tax receipt' })
  @ApiParam({ name: 'id', description: 'Tax receipt UUID' })
  @ApiQuery({
    name: 'to',
    required: false,
    description:
      "Override email address. Defaults to the user's registered email.",
  })
  @ApiResponse({
    status: 200,
    description: 'Receipt emailed; status updated to EMAILED.',
    type: TaxReceiptResponseDto,
  })
  emailTaxReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('to') recipientEmail?: string,
  ): Promise<TaxReceiptResponseDto> {
    return this.taxReceiptsService.emailTaxReceipt(id, recipientEmail);
  }
}
