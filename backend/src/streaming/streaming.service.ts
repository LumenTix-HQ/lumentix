import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { StreamingConfig } from './entities/streaming-config.entity';
import {
  ManageContentDeliveryDto,
  OptimizeStreamQualityDto,
  StreamDeliveryResponseDto,
  StreamPerformanceResponseDto,
} from './dto/streaming.dto';

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  constructor(
    @InjectRepository(StreamingConfig)
    private readonly streamingRepo: Repository<StreamingConfig>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    private readonly configService: ConfigService,
  ) {}

  async manageContentDelivery(
    eventId: string,
    organizerId: string,
    dto: ManageContentDeliveryDto,
  ): Promise<StreamDeliveryResponseDto> {
    const event = await this.requireOrganizerEvent(eventId, organizerId);

    let config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config) {
      config = this.streamingRepo.create({ eventId });
    }

    config.cdnBaseUrl = dto.cdnBaseUrl;
    config.streamUrl = dto.streamUrl;
    config.qualityProfile = dto.qualityProfile ?? 'auto';
    config.adaptiveBitrate = dto.adaptiveBitrate ?? true;
    config.deliveryConfig = {
      ...config.deliveryConfig,
      eventTitle: event.title,
      signedUrls: true,
      protocol: 'hls',
    };

    const saved = await this.streamingRepo.save(config);
    this.logger.log(`Content delivery configured for event ${eventId}`);

    return this.toDeliveryResponse(saved);
  }

  async optimizeStreamQuality(
    eventId: string,
    organizerId: string,
    dto: OptimizeStreamQualityDto,
  ): Promise<StreamDeliveryResponseDto> {
    const event = await this.requireOrganizerEvent(eventId, organizerId);
    let config = await this.streamingRepo.findOne({ where: { eventId } });

    if (!config || !config.streamUrl) {
      throw new NotFoundException(
        'Streaming is not configured for this event. Call manageContentDelivery first.',
      );
    }

    const qualityProfile = this.resolveQualityProfile(dto.targetBitrateKbps);
    config.targetBitrateKbps = dto.targetBitrateKbps;
    config.qualityProfile = qualityProfile;
    config.adaptiveBitrate = true;
    config.deliveryConfig = {
      ...config.deliveryConfig,
      ladder: this.buildAdaptiveLadder(dto.targetBitrateKbps),
      eventTitle: event.title,
    };

    const saved = await this.streamingRepo.save(config);
    this.logger.log(
      `Optimized stream quality for event ${eventId} to ${qualityProfile}`,
    );

    return this.toDeliveryResponse(saved);
  }

  async monitorStreamingPerformance(
    eventId: string,
    organizerId: string,
  ): Promise<StreamPerformanceResponseDto> {
    await this.requireOrganizerEvent(eventId, organizerId);

    const config = await this.streamingRepo.findOne({ where: { eventId } });
    if (!config) {
      throw new NotFoundException('No streaming configuration found for this event');
    }

    const stored = config.performanceMetrics ?? {};
    const avgBitrateKbps =
      Number(stored.avgBitrateKbps) || config.targetBitrateKbps || 2_500;
    const rebufferRatioPercent = Number(stored.rebufferRatioPercent) || 0.5;
    const concurrentViewers = Number(stored.concurrentViewers) || 0;
    const qualityScore = this.calculateQualityScore(rebufferRatioPercent);

    const metrics: StreamPerformanceResponseDto = {
      eventId,
      avgBitrateKbps,
      rebufferRatioPercent,
      concurrentViewers,
      qualityScore,
      healthStatus: this.healthFromScore(qualityScore),
      lastMeasuredAt: config.updatedAt,
    };

    config.performanceMetrics = {
      ...stored,
      ...metrics,
      sampledAt: new Date().toISOString(),
    };
    await this.streamingRepo.save(config);

    return metrics;
  }

  private async requireOrganizerEvent(
    eventId: string,
    organizerId: string,
  ): Promise<Event> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event with id "${eventId}" not found`);
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }
    return event;
  }

  private resolveQualityProfile(targetBitrateKbps: number): string {
    if (targetBitrateKbps >= 4_500) return '1080p';
    if (targetBitrateKbps >= 2_500) return '720p';
    return '480p';
  }

  private buildAdaptiveLadder(targetBitrateKbps: number): Array<{
    profile: string;
    bitrateKbps: number;
  }> {
    const peak = Math.max(targetBitrateKbps, 1_500);
    return [
      { profile: '1080p', bitrateKbps: Math.round(peak) },
      { profile: '720p', bitrateKbps: Math.round(peak * 0.55) },
      { profile: '480p', bitrateKbps: Math.round(peak * 0.3) },
    ];
  }

  private calculateQualityScore(rebufferRatioPercent: number): number {
    if (rebufferRatioPercent <= 0.5) return 95;
    if (rebufferRatioPercent <= 1.5) return 85;
    if (rebufferRatioPercent <= 3) return 70;
    return 50;
  }

  private healthFromScore(
    score: number,
  ): StreamPerformanceResponseDto['healthStatus'] {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'degraded';
    return 'poor';
  }

  private toDeliveryResponse(config: StreamingConfig): StreamDeliveryResponseDto {
    const cdn =
      config.cdnBaseUrl ??
      this.configService.get<string>('CDN_BASE_URL') ??
      'https://cdn.lumentix.local';
    const streamUrl = config.streamUrl ?? '';

    return {
      eventId: config.eventId,
      cdnBaseUrl: cdn,
      streamUrl,
      qualityProfile: config.qualityProfile,
      adaptiveBitrate: config.adaptiveBitrate,
      targetBitrateKbps: config.targetBitrateKbps,
      playbackUrl: streamUrl || `${cdn}/events/${config.eventId}/master.m3u8`,
    };
  }
}
