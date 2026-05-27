import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventStatus } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import {
  AgeVerification,
  AgeRestriction,
  VerificationMethod,
  VerificationStatus,
} from './entities/age-verification.entity';
import { VerifyAgeDto } from './dto/verify-age.dto';
import { SetAgeRestrictionDto } from './dto/set-age-restriction.dto';
import { AgeVerificationResponseDto } from './dto/age-verification-response.dto';

@Injectable()
export class AgeVerificationService {
  private readonly logger = new Logger(AgeVerificationService.name);

  constructor(
    @InjectRepository(AgeVerification)
    private readonly ageVerificationRepo: Repository<AgeVerification>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async verifyAge(
    userId: string,
    dto: VerifyAgeDto,
  ): Promise<AgeVerificationResponseDto> {
    const event = await this.eventRepo.findOne({ where: { id: dto.eventId } });
    if (!event) {
      throw new NotFoundException(`Event "${dto.eventId}" not found`);
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    const requiredRestriction = this.getEventAgeRestriction(event);
    if (requiredRestriction === AgeRestriction.NONE) {
      return {
        isCompliant: true,
        requiredRestriction: AgeRestriction.NONE,
        message: 'This event has no age restriction.',
      };
    }

    const minimumAge = this.getMinimumAge(requiredRestriction);
    const dateOfBirth = dto.dateOfBirth ?? null;

    let isCompliant = false;
    let verificationStatus: VerificationStatus = 'verified';
    const method = dto.verificationMethod ?? VerificationMethod.MANUAL;

    if (dateOfBirth) {
      isCompliant = this.checkAgeCompliance(dateOfBirth, minimumAge);
      if (!isCompliant) {
        verificationStatus = 'failed';
        throw new ForbiddenException(
          `You must be at least ${minimumAge} years old to attend this event.`,
        );
      }
    } else {
      const existing = await this.ageVerificationRepo.findOne({
        where: { userId, eventId: dto.eventId, status: 'verified' },
      });

      if (existing && this.isVerificationStillValid(existing)) {
        return {
          isCompliant: true,
          requiredRestriction,
          verificationStatus: 'verified',
          verificationMethod: existing.verificationMethod,
          verifiedAt: existing.verifiedAt?.toISOString(),
          message: 'Age already verified.',
        };
      }

      throw new BadRequestException(
        'Date of birth is required for age verification.',
      );
    }

    const existingRecord = await this.ageVerificationRepo.findOne({
      where: { userId, eventId: dto.eventId },
    });

    const record = existingRecord ?? this.ageVerificationRepo.create();
    record.userId = userId;
    record.eventId = dto.eventId;
    record.dateOfBirth = dateOfBirth;
    record.ageRestriction = requiredRestriction;
    record.verificationMethod = method;
    record.status = verificationStatus;
    record.identityVerificationId = dto.identityVerificationId ?? null;
    record.verifiedAt = verificationStatus === 'verified' ? new Date() : null;

    const saved = await this.ageVerificationRepo.save(record);

    await this.auditService.log({
      action: AuditAction.AGE_VERIFIED,
      userId,
      resourceId: saved.id,
      metadata: {
        eventId: dto.eventId,
        restriction: requiredRestriction,
        method,
        compliant: isCompliant,
      },
    });

    return {
      isCompliant,
      requiredRestriction,
      verificationStatus: saved.status,
      verificationMethod: saved.verificationMethod,
      verifiedAt: saved.verifiedAt?.toISOString(),
      message: isCompliant
        ? 'Age verification passed.'
        : 'Age verification failed.',
    };
  }

  async setAgeRestriction(
    eventId: string,
    organizerId: string,
    dto: SetAgeRestrictionDto,
  ): Promise<{ ageRestriction: AgeRestriction }> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }

    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You are not the organizer of this event.');
    }

    if (event.status !== EventStatus.DRAFT) {
      throw new BadRequestException(
        'Age restriction can only be set while the event is in DRAFT status.',
      );
    }

    event.ageRestriction = dto.ageRestriction;
    await this.eventRepo.save(event);

    await this.auditService.log({
      action: AuditAction.AGE_RESTRICTION_SET,
      userId: organizerId,
      resourceId: eventId,
      metadata: { restriction: dto.ageRestriction },
    });

    return { ageRestriction: dto.ageRestriction };
  }

  async validateAgeCompliance(
    userId: string,
    eventId: string,
  ): Promise<AgeVerificationResponseDto> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }

    const requiredRestriction = this.getEventAgeRestriction(event);
    if (requiredRestriction === AgeRestriction.NONE) {
      return {
        isCompliant: true,
        requiredRestriction: AgeRestriction.NONE,
        message: 'No age restriction for this event.',
      };
    }

    const verification = await this.ageVerificationRepo.findOne({
      where: { userId, eventId, status: 'verified' },
    });

    if (!verification || !this.isVerificationStillValid(verification)) {
      return {
        isCompliant: false,
        requiredRestriction,
        verificationStatus: verification?.status ?? 'pending',
        message: 'Age verification required. Please verify your age.',
      };
    }

    return {
      isCompliant: true,
      requiredRestriction,
      verificationStatus: 'verified',
      verificationMethod: verification.verificationMethod,
      verifiedAt: verification.verifiedAt?.toISOString(),
      message: 'Age compliance validated.',
    };
  }

  async getVerificationStatus(
    userId: string,
    eventId: string,
  ): Promise<AgeVerificationResponseDto> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found`);
    }

    const requiredRestriction = this.getEventAgeRestriction(event);
    if (requiredRestriction === AgeRestriction.NONE) {
      return {
        isCompliant: true,
        requiredRestriction: AgeRestriction.NONE,
        message: 'No age restriction for this event.',
      };
    }

    const record = await this.ageVerificationRepo.findOne({
      where: { userId, eventId },
    });

    if (!record) {
      return {
        isCompliant: false,
        requiredRestriction,
        verificationStatus: 'pending',
        message: 'No age verification record found.',
      };
    }

    const isValid = this.isVerificationStillValid(record);

    return {
      isCompliant: isValid && record.status === 'verified',
      requiredRestriction,
      verificationStatus: record.status,
      verificationMethod: record.verificationMethod,
      verifiedAt: record.verifiedAt?.toISOString(),
      message: isValid
        ? 'Age verification is current.'
        : 'Age verification has expired.',
    };
  }

  private getEventAgeRestriction(event: Event): AgeRestriction {
    return (event as any).ageRestriction ?? AgeRestriction.NONE;
  }

  private getMinimumAge(restriction: AgeRestriction): number {
    switch (restriction) {
      case AgeRestriction.EIGHTEEN_PLUS:
        return 18;
      case AgeRestriction.TWENTY_ONE_PLUS:
        return 21;
      default:
        return 0;
    }
  }

  private checkAgeCompliance(dateOfBirth: string, minimumAge: number): boolean {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= minimumAge;
  }

  private isVerificationStillValid(verification: AgeVerification): boolean {
    if (verification.status !== 'verified' || !verification.verifiedAt) {
      return false;
    }
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - verification.verifiedAt.getTime();
    return elapsed < ONE_YEAR_MS;
  }
}
