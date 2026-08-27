import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { SchedulingService } from './scheduling.service';
import { EventCategory } from '../events/entities/event.entity';
import {
  AnalyzeOptimalTimingDto,
  SuggestEventScheduleDto,
  PredictAttendanceImpactDto,
} from './dto/scheduling.dto';

@ApiTags('scheduling')
@Controller('scheduling')
@UseGuards(JwtAuthGuard)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Post('analyze-optimal-timing')
  @ApiOperation({ summary: 'Analyze optimal timing for an event' })
  @ApiResponse({ status: 200, description: 'Optimal timing analysis completed' })
  async analyzeOptimalTiming(@Body() dto: AnalyzeOptimalTimingDto) {
    return this.schedulingService.analyzeOptimalTiming(
      dto.category,
      dto.location,
      dto.duration,
      dto.targetAudience,
    );
  }

  @Post('suggest-schedule')
  @ApiOperation({ summary: 'Get event schedule suggestions' })
  @ApiResponse({ status: 200, description: 'Schedule suggestions generated' })
  async suggestEventSchedule(@Body() dto: SuggestEventScheduleDto) {
    return this.schedulingService.suggestEventSchedule(
      dto.category,
      dto.location,
      dto.duration,
      {
        start: new Date(dto.dateRange.start),
        end: new Date(dto.dateRange.end),
      },
    );
  }

  @Post('predict-attendance-impact/:eventId')
  @ApiOperation({ summary: 'Predict attendance impact of schedule change' })
  @ApiResponse({ status: 200, description: 'Attendance impact prediction completed' })
  async predictAttendanceImpact(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: PredictAttendanceImpactDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.schedulingService.predictAttendanceImpact(
      eventId,
      new Date(dto.newStartDate),
      new Date(dto.newEndDate),
    );
  }

  @Get('seasonal-insights')
  @ApiOperation({ summary: 'Get seasonal insights for event categories' })
  @ApiResponse({ status: 200, description: 'Seasonal insights retrieved' })
  async getSeasonalInsights(
    @Query('category') category: EventCategory,
    @Query('location') location: string,
  ) {
    // This would call a method to get seasonal insights
    return {
      category,
      location,
      insights: [
        'Summer months show 40% higher attendance for outdoor events',
        'December has lowest attendance due to holiday competition',
        'Weekend events perform 60% better than weekdays',
      ],
    };
  }

  @Get('competition-analysis')
  @ApiOperation({ summary: 'Analyze competition for specific time periods' })
  @ApiResponse({ status: 200, description: 'Competition analysis completed' })
  async analyzeCompetition(
    @Query('category') category: EventCategory,
    @Query('location') location: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    // This would analyze competition in the specified time range
    return {
      timeRange: { startDate, endDate },
      competingEvents: 3,
      competitionLevel: 'medium',
      recommendations: [
        'Consider moving to the following week for lower competition',
        'Current slot has moderate competition from similar events',
      ],
    };
  }
}
