import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PassPackage, UserPassPackage } from './entities/pass-package.entity';
import { User } from '../users/entities/user.entity';
import { Event } from '../events/entities/event.entity';
import { CreatePassPackageDto } from './dto/create-pass-package.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

@Injectable()
export class PassPackagesService {
  constructor(
    @InjectRepository(PassPackage)
    private passPackageRepository: Repository<PassPackage>,
    @InjectRepository(UserPassPackage)
    private userPassPackageRepository: Repository<UserPassPackage>,
    @InjectRepository(Event)
    private eventRepository: Repository<Event>,
  ) {}

  /**
   * Create a new cross-event pass package
   */
  async createPassPackage(
    creator: User,
    dto: CreatePassPackageDto,
  ): Promise<PassPackage> {
    // Validate organizer role
    if (creator.role !== 'ORGANIZER' && creator.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only organizers can create pass packages',
      );
    }

    // Validate event count
    if (dto.eventsAllowed > dto.totalEvents) {
      throw new BadRequestException(
        'Events allowed cannot exceed total events',
      );
    }

    // Validate that all events exist and belong to organizer (optional, depends on business logic)
    if (dto.eventIds && dto.eventIds.length > 0) {
      const events = await this.eventRepository.find({
        where: { id: In(dto.eventIds) },
      });

      if (events.length !== dto.eventIds.length) {
        throw new BadRequestException(
          'Some event IDs do not exist',
        );
      }

      // Optional: verify organizer owns these events
      // const ownedEvents = events.filter(e => e.createdBy === creator.id);
      // if (ownedEvents.length !== events.length) {
      //   throw new ForbiddenException('Not authorized to include some events');
      // }
    }

    const passPackage = this.passPackageRepository.create({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      currency: dto.currency,
      eventsAllowed: dto.eventsAllowed,
      totalEvents: dto.totalEvents,
      eventIds: dto.eventIds,
      validUntil: dto.validUntil,
      createdBy: creator.id,
      isActive: true,
      maxPackagesToSell: dto.maxPackagesToSell || null,
    });

    return this.passPackageRepository.save(passPackage);
  }

  /**
   * Get all active pass packages
   */
  async getPassPackages(
    skip = 0,
    take = 20,
  ): Promise<PaginatedResponseDto<PassPackage>> {
    const [data, total] = await this.passPackageRepository.findAndCount({
      where: { isActive: true, deletedAt: null },
      skip,
      take,
      order: { createdAt: 'DESC' },
    });

    return { data, total, skip, take };
  }

  /**
   * Get pass package by ID
   */
  async getPassPackageById(id: string): Promise<PassPackage> {
    const passPackage = await this.passPackageRepository.findOne({
      where: { id, isActive: true, deletedAt: null },
    });

    if (!passPackage) {
      throw new NotFoundException('Pass package not found');
    }

    return passPackage;
  }

  /**
   * Purchase a pass package
   */
  async purchasePassPackage(
    user: User,
    packageId: string,
    transactionHash: string,
  ): Promise<UserPassPackage> {
    const passPackage = await this.getPassPackageById(packageId);

    // Check if max packages sold limit reached
    if (
      passPackage.maxPackagesToSell &&
      passPackage.packagesSold >= passPackage.maxPackagesToSell
    ) {
      throw new BadRequestException(
        'This pass package is no longer available (sold out)',
      );
    }

    // Check if pass package is expired
    if (passPackage.validUntil < new Date()) {
      throw new BadRequestException('This pass package has expired');
    }

    // Check if user already purchased this package
    const existingPurchase = await this.userPassPackageRepository.findOne({
      where: {
        userId: user.id,
        passPackageId: packageId,
        deletedAt: null,
      },
    });

    if (existingPurchase) {
      throw new BadRequestException(
        'User has already purchased this pass package',
      );
    }

    // Create user pass package record
    const userPassPackage = this.userPassPackageRepository.create({
      userId: user.id,
      passPackageId: packageId,
      remainingAllowance: passPackage.eventsAllowed,
      expiryDate: passPackage.validUntil,
      transactionHash,
    });

    const savedUserPassPackage =
      await this.userPassPackageRepository.save(userPassPackage);

    // Update packages sold count
    passPackage.packagesSold += 1;
    await this.passPackageRepository.save(passPackage);

    return savedUserPassPackage;
  }

  /**
   * Get user's pass packages
   */
  async getUserPassPackages(
    userId: string,
    skip = 0,
    take = 20,
  ): Promise<PaginatedResponseDto<UserPassPackage>> {
    const [data, total] = await this.userPassPackageRepository.findAndCount({
      where: {
        userId,
        deletedAt: null,
      },
      relations: ['passPackage'],
      skip,
      take,
      order: { purchaseDate: 'DESC' },
    });

    return { data, total, skip, take };
  }

  /**
   * Check pass balance and eligibility
   */
  async checkPassBalance(passId: string): Promise<{
    passId: string;
    remainingAllowance: number;
    usedCount: number;
    totalAllowance: number;
    validUntil: Date;
    isValid: boolean;
  }> {
    const userPass = await this.userPassPackageRepository.findOne({
      where: { id: passId, deletedAt: null },
      relations: ['passPackage'],
    });

    if (!userPass) {
      throw new NotFoundException('Pass not found');
    }

    const isValid =
      userPass.remainingAllowance > 0 && userPass.expiryDate > new Date();

    return {
      passId,
      remainingAllowance: userPass.remainingAllowance,
      usedCount: userPass.usedCount,
      totalAllowance: userPass.passPackage.eventsAllowed,
      validUntil: userPass.expiryDate,
      isValid,
    };
  }

  /**
   * Check if user can use pass for a specific event
   */
  async checkEventEligibility(
    passId: string,
    eventId: string,
  ): Promise<{
    eligible: boolean;
    eventId: string;
    remainingAllowance: number;
    eventTitle?: string;
    reason?: string;
  }> {
    const userPass = await this.userPassPackageRepository.findOne({
      where: { id: passId, deletedAt: null },
      relations: ['passPackage'],
    });

    if (!userPass) {
      return {
        eligible: false,
        eventId,
        remainingAllowance: 0,
        reason: 'Pass not found',
      };
    }

    // Check if pass is expired
    if (userPass.expiryDate < new Date()) {
      return {
        eligible: false,
        eventId,
        remainingAllowance: userPass.remainingAllowance,
        reason: 'Pass has expired',
      };
    }

    // Check if allowance remaining
    if (userPass.remainingAllowance <= 0) {
      return {
        eligible: false,
        eventId,
        remainingAllowance: 0,
        reason: 'No remaining allowance',
      };
    }

    // Check if event is in the pass package
    if (!userPass.passPackage.eventIds.includes(eventId)) {
      return {
        eligible: false,
        eventId,
        remainingAllowance: userPass.remainingAllowance,
        reason: 'Event not included in this pass package',
      };
    }

    // Check if already used for this event
    if (userPass.usedEventIds.includes(eventId)) {
      return {
        eligible: false,
        eventId,
        remainingAllowance: userPass.remainingAllowance,
        reason: 'Pass already used for this event',
      };
    }

    const event = await this.eventRepository.findOne({ where: { id: eventId } });

    return {
      eligible: true,
      eventId,
      remainingAllowance: userPass.remainingAllowance,
      eventTitle: event?.title,
    };
  }

  /**
   * Deduct pass allowance (use the pass for an event)
   */
  async deductPassAllowance(
    passId: string,
    eventId: string,
  ): Promise<UserPassPackage> {
    const userPass = await this.userPassPackageRepository.findOne({
      where: { id: passId, deletedAt: null },
      relations: ['passPackage'],
    });

    if (!userPass) {
      throw new NotFoundException('Pass not found');
    }

    // Check eligibility
    const eligibility = await this.checkEventEligibility(passId, eventId);
    if (!eligibility.eligible) {
      throw new BadRequestException(
        eligibility.reason || 'Pass cannot be used for this event',
      );
    }

    // Deduct allowance
    userPass.remainingAllowance -= 1;
    userPass.usedCount += 1;
    userPass.usedEventIds.push(eventId);

    return this.userPassPackageRepository.save(userPass);
  }

  /**
   * Update pass package (organizer only)
   */
  async updatePassPackage(
    packageId: string,
    creator: User,
    updates: Partial<CreatePassPackageDto>,
  ): Promise<PassPackage> {
    const passPackage = await this.passPackageRepository.findOne({
      where: { id: packageId },
    });

    if (!passPackage) {
      throw new NotFoundException('Pass package not found');
    }

    if (passPackage.createdBy !== creator.id && creator.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Not authorized to update this pass package',
      );
    }

    // Only allow certain fields to be updated
    if (updates.name) passPackage.name = updates.name;
    if (updates.description) passPackage.description = updates.description;
    if (updates.isActive !== undefined)
      passPackage.isActive = updates.isActive;

    return this.passPackageRepository.save(passPackage);
  }

  /**
   * Delete pass package (soft delete)
   */
  async deletePassPackage(packageId: string, user: User): Promise<void> {
    const passPackage = await this.passPackageRepository.findOne({
      where: { id: packageId },
    });

    if (!passPackage) {
      throw new NotFoundException('Pass package not found');
    }

    if (passPackage.createdBy !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Not authorized to delete this pass package',
      );
    }

    passPackage.deletedAt = new Date();
    await this.passPackageRepository.save(passPackage);
  }
}
