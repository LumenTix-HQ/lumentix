import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FraudDetectionService } from './fraud-detection.service';
import {
  FlagStatus,
  FraudFlagReason,
} from './entities/flagged-transaction.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { Roles } from '../admin/roles.decorator';
import { RolesGuard } from '../admin/roles.guard';

@ApiTags('Fraud Detection')
@Controller('fraud-detection')
export class FraudDetectionController {
  constructor(private fraudDetectionService: FraudDetectionService) {}

  /**
   * Get secondary market analytics for an event
   * Includes fraud detection metrics
   */
  @Get('secondary-market-analytics/:eventId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get secondary market fraud analytics' })
  @ApiResponse({
    status: 200,
    description: 'Secondary market analytics with fraud indicators',
  })
  async getSecondaryMarketAnalytics(
    @Param('eventId') eventId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate ? new Date(endDate) : new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    return this.fraudDetectionService.getSecondaryMarketAnalytics(
      eventId,
      start,
      end,
    );
  }

  /**
   * Get flagged transactions
   */
  @Get('flagged-transactions')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get flagged transactions' })
  @ApiResponse({
    status: 200,
    description: 'List of flagged transactions',
  })
  async getFlaggedTransactions(
    @Query('status') status?: FlagStatus,
    @Query('skip') skip = 0,
    @Query('take') take = 20,
  ) {
    return this.fraudDetectionService.getFlaggedTransactions(
      status,
      skip,
      take,
    );
  }

  /**
   * Get details of a specific flagged transaction
   */
  @Get('flagged-transactions/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get flagged transaction details' })
  @ApiResponse({
    status: 200,
    description: 'Flagged transaction details',
  })
  async getFlaggedTransactionById(@Param('id') id: string) {
    const result = await this.fraudDetectionService.getFlaggedTransactions(
      undefined,
      0,
      1,
    );

    const transaction = result.data.find((t) => t.id === id);
    if (!transaction) {
      throw new BadRequestException('Flagged transaction not found');
    }

    return transaction;
  }

  /**
   * Review a flagged transaction
   */
  @Patch('flagged-transactions/:id/review')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review flagged transaction' })
  @ApiResponse({
    status: 200,
    description: 'Transaction review recorded',
  })
  async reviewFlaggedTransaction(
    @Request() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      status: FlagStatus;
      notes: string;
    },
  ) {
    if (!body.status || !body.notes) {
      throw new BadRequestException('Status and notes are required');
    }

    return this.fraudDetectionService.reviewFlaggedTransaction(
      id,
      req.user,
      body.status,
      body.notes,
    );
  }

  /**
   * Flag a transaction as fraudulent
   */
  @Post('flag-transaction')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Flag transaction as fraudulent' })
  @ApiResponse({
    status: 201,
    description: 'Transaction flagged',
  })
  async flagFraudulentTransaction(
    @Body()
    body: {
      transactionHash: string;
      sellerId: string;
      buyerId: string;
      originalPrice: number;
      salePrice: number;
      eventId: string;
      flagReason: FraudFlagReason;
      riskScore: number;
      fraudIndicators?: Record<string, any>;
    },
  ) {
    return this.fraudDetectionService.flagFraudulentTransaction(
      body.transactionHash,
      body.sellerId,
      body.buyerId,
      body.originalPrice,
      body.salePrice,
      body.eventId,
      body.flagReason,
      body.riskScore,
      body.fraudIndicators,
    );
  }

  /**
   * Hold a suspicious trade from completing
   */
  @Post('hold-trade')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hold suspicious trade' })
  @ApiResponse({
    status: 200,
    description: 'Trade held for review',
  })
  async holdSuspiciousTrade(
    @Body()
    body: {
      transactionHash: string;
      reason: string;
    },
  ) {
    if (!body.transactionHash || !body.reason) {
      throw new BadRequestException('Transaction hash and reason are required');
    }

    await this.fraudDetectionService.holdSuspiciousTrade(
      body.transactionHash,
      body.reason,
    );

    return { message: 'Trade held for review' };
  }

  /**
   * Analyze trade patterns for fraud
   */
  @Post('analyze-patterns')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze trade patterns for fraud' })
  @ApiResponse({
    status: 200,
    description: 'Pattern analysis results',
  })
  async analyzePatterns(
    @Body()
    body: {
      eventId: string;
      trades: Array<{
        transactionHash: string;
        sellerId: string;
        buyerId: string;
        originalPrice: number;
        salePrice: number;
        timestamp: string;
      }>;
    },
  ) {
    if (!body.eventId || !body.trades || body.trades.length === 0) {
      throw new BadRequestException('Event ID and trades are required');
    }

    const trades = body.trades.map((t) => ({
      ...t,
      timestamp: new Date(t.timestamp),
    }));

    return this.fraudDetectionService.analyzeTradePatterns(
      body.eventId,
      trades,
    );
  }

  /**
   * Detect fraud patterns in trades
   */
  @Post('detect-patterns')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detect fraud patterns' })
  @ApiResponse({
    status: 200,
    description: 'Detected patterns',
  })
  async detectPatterns(
    @Body()
    body: {
      trades: Array<{
        transactionHash: string;
        sellerId: string;
        buyerId: string;
        originalPrice: number;
        salePrice: number;
        timestamp: string;
      }>;
    },
  ) {
    if (!body.trades || body.trades.length === 0) {
      throw new BadRequestException('Trades are required');
    }

    const trades = body.trades.map((t) => ({
      ...t,
      timestamp: new Date(t.timestamp),
    }));

    const patterns = this.fraudDetectionService.detectFraudPatterns(trades);

    return { detectedPatterns: patterns };
  }

  /**
   * Calculate risk score for a trade
   */
  @Post('calculate-risk-score')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate trade risk score' })
  @ApiResponse({
    status: 200,
    description: 'Risk score calculated',
  })
  async calculateRiskScore(
    @Body()
    body: {
      originalPrice: number;
      salePrice: number;
      timeSincePurchaseMinutes: number;
      buyerTransactionCount: number;
      isNewAccount: boolean;
    },
  ) {
    const riskScore = this.fraudDetectionService.calculateTradeRiskScore(
      body.originalPrice,
      body.salePrice,
      body.timeSincePurchaseMinutes,
      body.buyerTransactionCount,
      body.isNewAccount,
    );

    return {
      riskScore,
      riskLevel:
        riskScore < 0.3
          ? 'LOW'
          : riskScore < 0.6
          ? 'MEDIUM'
          : riskScore < 0.8
          ? 'HIGH'
          : 'CRITICAL',
    };
  }
}
