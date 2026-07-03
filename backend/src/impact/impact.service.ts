import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventImpact } from './entities/event-impact.entity';
import { SustainabilityMetric } from './entities/sustainability-metric.entity';
import { MeasureEventImpactDto } from './dto/measure-event-impact.dto';
import { GenerateImpactReportDto, ReportFormat, ReportSection } from './dto/generate-impact-report.dto';
import { TrackSustainabilityMetricDto, MetricType } from './dto/track-sustainability-metric.dto';
import { Event } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import PDFDocument from 'pdfkit';

@Injectable()
export class ImpactService {
  private readonly logger = new Logger(ImpactService.name);

  constructor(
    @InjectRepository(EventImpact)
    private readonly impactRepository: Repository<EventImpact>,
    @InjectRepository(SustainabilityMetric)
    private readonly sustainabilityRepository: Repository<SustainabilityMetric>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly eventsService: EventsService,
  ) {}

  async measureEventImpact(
    eventId: string,
    dto: MeasureEventImpactDto,
    organizerId: string,
  ): Promise<EventImpact> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    const existingImpact = await this.impactRepository.findOne({
      where: { eventId },
    });

    const impactData = {
      eventId,
      economicMetrics: dto.economicMetrics || null,
      socialMetrics: dto.socialMetrics || null,
      environmentalMetrics: dto.environmentalMetrics || null,
      customMetrics: dto.customMetrics || null,
      notes: dto.notes || null,
      overallImpactScore: this.calculateOverallImpactScore(dto),
    };

    if (existingImpact) {
      Object.assign(existingImpact, impactData);
      return this.impactRepository.save(existingImpact);
    }

    return this.impactRepository.save(this.impactRepository.create(impactData));
  }

  async generateImpactReport(
    eventId: string,
    dto: GenerateImpactReportDto,
    organizerId: string,
  ): Promise<any> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    const impact = await this.impactRepository.findOne({
      where: { eventId },
    });

    if (!impact) {
      throw new NotFoundException('No impact data found for this event.');
    }

    const sustainabilityMetrics = await this.sustainabilityRepository.find({
      where: { eventId },
    });

    const reportData = this.buildReportData(impact, sustainabilityMetrics, dto);

    if (dto.format === ReportFormat.PDF) {
      return this.generatePdfReport(reportData, event);
    } else if (dto.format === ReportFormat.CSV) {
      return this.generateCsvReport(reportData);
    }

    return {
      reportId: impact.id,
      eventId,
      generatedAt: new Date().toISOString(),
      format: dto.format || ReportFormat.JSON,
      data: reportData,
      summary: this.calculateReportSummary(impact),
    };
  }

  async trackSustainabilityMetric(
    eventId: string,
    dto: TrackSustainabilityMetricDto,
    organizerId: string,
  ): Promise<SustainabilityMetric> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    const metric = this.sustainabilityRepository.create({
      eventId,
      metricType: dto.metricType,
      metricName: dto.metricName,
      value: dto.value,
      unit: dto.unit,
      breakdown: dto.breakdown || null,
      measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
      notes: dto.notes || null,
    });

    return this.sustainabilityRepository.save(metric);
  }

  async getSustainabilityMetrics(eventId: string, organizerId: string): Promise<SustainabilityMetric[]> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    return this.sustainabilityRepository.find({
      where: { eventId },
      order: { createdAt: 'DESC' },
    });
  }

  async getEventImpact(eventId: string, organizerId: string): Promise<EventImpact> {
    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    const impact = await this.impactRepository.findOne({
      where: { eventId },
    });

    if (!impact) {
      throw new NotFoundException('No impact data found for this event.');
    }

    return impact;
  }

  private calculateOverallImpactScore(dto: MeasureEventImpactDto): number {
    let score = 0;
    let weight = 0;

    if (dto.economicMetrics) {
      const economicScore = this.normalizeEconomicScore(dto.economicMetrics);
      score += economicScore * 0.4;
      weight += 0.4;
    }

    if (dto.socialMetrics) {
      const socialScore = this.normalizeSocialScore(dto.socialMetrics);
      score += socialScore * 0.35;
      weight += 0.35;
    }

    if (dto.environmentalMetrics) {
      const environmentalScore = this.normalizeEnvironmentalScore(dto.environmentalMetrics);
      score += environmentalScore * 0.25;
      weight += 0.25;
    }

    return weight > 0 ? Math.round((score / weight) * 100) / 100 : 0;
  }

  private normalizeEconomicScore(metrics: any): number {
    let score = 0;
    if (metrics.totalRevenue > 0) score += 25;
    if (metrics.localBusinessImpact > 0) score += 25;
    if (metrics.jobCreation > 0) score += 25;
    if (metrics.taxRevenue > 0) score += 25;
    return Math.min(score, 100);
  }

  private normalizeSocialScore(metrics: any): number {
    let score = 0;
    if (metrics.attendeeCount > 0) score += 25;
    if (metrics.communityEngagement > 0) score += 25;
    if (metrics.diversityScore > 0) score += 25;
    if (metrics.accessibilityRating > 0) score += 25;
    return Math.min(score, 100);
  }

  private normalizeEnvironmentalScore(metrics: any): number {
    let score = 0;
    if (metrics.sustainabilityScore > 0) score += 40;
    if (metrics.carbonFootprint >= 0) score += 20;
    if (metrics.wasteGenerated >= 0) score += 20;
    if (metrics.energyConsumption >= 0) score += 20;
    return Math.min(score, 100);
  }

  private buildReportData(
    impact: EventImpact,
    sustainabilityMetrics: SustainabilityMetric[],
    dto: GenerateImpactReportDto,
  ): any {
    const sections = dto.sections || [
      ReportSection.ECONOMIC,
      ReportSection.SOCIAL,
      ReportSection.ENVIRONMENTAL,
      ReportSection.SUMMARY,
    ];

    const data: any = {
      sections: {},
      sustainabilityMetrics: sustainabilityMetrics.reduce((acc, metric) => {
        if (!acc[metric.metricType]) {
          acc[metric.metricType] = [];
        }
        acc[metric.metricType].push(metric);
        return acc;
      }, {} as Record<string, SustainabilityMetric[]>),
    };

    if (sections.includes(ReportSection.ECONOMIC) && impact.economicMetrics) {
      data.sections.economic = impact.economicMetrics;
    }

    if (sections.includes(ReportSection.SOCIAL) && impact.socialMetrics) {
      data.sections.social = impact.socialMetrics;
    }

    if (sections.includes(ReportSection.ENVIRONMENTAL) && impact.environmentalMetrics) {
      data.sections.environmental = impact.environmentalMetrics;
    }

    if (sections.includes(ReportSection.CUSTOM) && impact.customMetrics) {
      data.sections.custom = impact.customMetrics;
    }

    if (sections.includes(ReportSection.SUMMARY)) {
      data.sections.summary = {
        overallImpactScore: impact.overallImpactScore,
        notes: impact.notes,
        measuredAt: impact.updatedAt,
      };
    }

    return data;
  }

  private calculateReportSummary(impact: EventImpact): any {
    return {
      overallImpactScore: impact.overallImpactScore,
      economicScore: impact.economicMetrics ? this.normalizeEconomicScore(impact.economicMetrics) : 0,
      socialScore: impact.socialMetrics ? this.normalizeSocialScore(impact.socialMetrics) : 0,
      environmentalScore: impact.environmentalMetrics
        ? this.normalizeEnvironmentalScore(impact.environmentalMetrics)
        : 0,
    };
  }

  private async generatePdfReport(data: any, event: Event): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text(`Event Impact Report: ${event.title}`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown();

      if (data.sections.economic) {
        doc.fontSize(16).text('Economic Impact', { underline: true });
        doc.fontSize(12);
        Object.entries(data.sections.economic).forEach(([key, value]) => {
          doc.text(`${key}: ${value}`);
        });
        doc.moveDown();
      }

      if (data.sections.social) {
        doc.fontSize(16).text('Social Impact', { underline: true });
        doc.fontSize(12);
        Object.entries(data.sections.social).forEach(([key, value]) => {
          doc.text(`${key}: ${value}`);
        });
        doc.moveDown();
      }

      if (data.sections.environmental) {
        doc.fontSize(16).text('Environmental Impact', { underline: true });
        doc.fontSize(12);
        Object.entries(data.sections.environmental).forEach(([key, value]) => {
          doc.text(`${key}: ${value}`);
        });
        doc.moveDown();
      }

      if (data.sections.summary) {
        doc.fontSize(16).text('Summary', { underline: true });
        doc.fontSize(12);
        doc.text(`Overall Impact Score: ${data.sections.summary.overallImpactScore}`);
        if (data.sections.summary.notes) {
          doc.text(`Notes: ${data.sections.summary.notes}`);
        }
      }

      doc.end();
    });
  }

  private generateCsvReport(data: any): string {
    const rows: string[] = [];
    rows.push('Section,Metric,Value');

    Object.entries(data.sections).forEach(([section, metrics]: [string, any]) => {
      if (typeof metrics === 'object' && metrics !== null) {
        Object.entries(metrics).forEach(([key, value]) => {
          rows.push(`${section},${key},${value}`);
        });
      }
    });

    return rows.join('\n');
  }
}
