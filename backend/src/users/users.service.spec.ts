import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcryptjs from 'bcryptjs';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { CurrenciesService } from '../currencies/currencies.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

const makeMockUser = (): User => ({
  id: 'uuid-1',
  email: 'test@example.com',
  passwordHash: 'hashed_password',
  role: UserRole.EVENT_GOER,
  stellarPublicKey: null,
  status: UserStatus.ACTIVE,
  balances: {},
  balancesUpdatedAt: null,
  notificationPreferences: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});

type mockUserRepository = Partial<Record<keyof Repository<User>, jest.Mock>>;

const createmockUserRepository = (): mockUserRepository => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let mockUserRepository: mockUserRepository;
  let mockTicketRepository: Partial<
    Record<keyof Repository<TicketEntity>, jest.Mock>
  >;

  beforeEach(async () => {
    mockUserRepository = createmockUserRepository();
    mockTicketRepository = {
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(TicketEntity),
          useValue: mockTicketRepository,
        },
        { provide: CurrenciesService, useValue: {} },
        { provide: ExchangeRatesService, useValue: {} },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('createUser', () => {
    it('should create a user with valid data and return without passwordHash', async () => {
      const mockUser = makeMockUser();
      mockUserRepository.findOne!.mockResolvedValue(null);
      mockUserRepository.create!.mockReturnValue(mockUser);
      mockUserRepository.save!.mockResolvedValue(mockUser);

      const result = await service.createUser({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('test@example.com');
    });

    it('should throw ConflictException when email already exists', async () => {
      mockUserRepository.findOne!.mockResolvedValue(makeMockUser());

      await expect(
        service.createUser({
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should hash the password (not equal to plain text)', async () => {
      const mockUser = makeMockUser();
      let capturedHash: string | undefined;

      mockUserRepository.findOne!.mockResolvedValue(null);
      mockUserRepository.create!.mockImplementation(
        (data: Partial<User>): User => {
          capturedHash = data.passwordHash;
          return { ...mockUser, ...data };
        },
      );
      mockUserRepository.save!.mockImplementation(
        (user: User): Promise<User> => Promise.resolve(user),
      );

      await service.createUser({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(capturedHash).toBeDefined();
      expect(capturedHash).not.toBe('password123');
      const isMatch = await bcryptjs.compare(
        'password123',
        capturedHash as string,
      );
      expect(isMatch).toBe(true);
    });

    it('should default role to EVENT_GOER when not provided', async () => {
      const mockUser = makeMockUser();
      mockUserRepository.findOne!.mockResolvedValue(null);
      mockUserRepository.create!.mockImplementation(
        (data: Partial<User>): User => ({ ...mockUser, ...data }),
      );
      mockUserRepository.save!.mockImplementation(
        (user: User): Promise<User> => Promise.resolve(user),
      );

      const result = await service.createUser({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.role).toBe(UserRole.EVENT_GOER);
    });
  });

  describe('findByEmail', () => {
    it('should return the correct user by email', async () => {
      const mockUser = makeMockUser();
      mockUserRepository.findOne!.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return null when user not found', async () => {
      mockUserRepository.findOne!.mockResolvedValue(null);

      const result = await service.findByEmail('nobody@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user without passwordHash', async () => {
      mockUserRepository.findOne!.mockResolvedValue(makeMockUser());

      const result = await service.findById('uuid-1');

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findOne!.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('updates email and returns user without passwordHash', async () => {
      const user = makeMockUser();
      const updated = { ...user, email: 'updated@example.com' };

      mockUserRepository
        .findOne!.mockResolvedValueOnce(user)
        .mockResolvedValueOnce(null); // first find user, then email check
      mockUserRepository.save!.mockResolvedValue(updated);

      const result = await service.updateProfile('uuid-1', {
        email: 'updated@example.com',
      });

      expect(result.email).toBe('updated@example.com');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when new email is taken', async () => {
      const user = makeMockUser();
      mockUserRepository
        .findOne!.mockResolvedValueOnce(user)
        .mockResolvedValueOnce({ ...user, id: 'other' });

      await expect(
        service.updateProfile('uuid-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('changes password when currentPassword is correct', async () => {
      const user = makeMockUser();
      const originalHash = user.passwordHash;
      mockUserRepository.findOne!.mockResolvedValue(user);
      mockUserRepository.save!.mockImplementation(async (u: User) => ({
        ...u,
      }));
      jest.spyOn(bcryptjs, 'compare').mockImplementation(async () => true);

      const result = await service.updateProfile('uuid-1', {
        newPassword: 'newPassword123',
        currentPassword: 'password123',
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(bcryptjs.compare).toHaveBeenCalledWith(
        'password123',
        originalHash,
      );
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when currentPassword is wrong', async () => {
      const user = makeMockUser();
      mockUserRepository.findOne!.mockResolvedValue(user);
      jest.spyOn(bcryptjs, 'compare').mockImplementation(async () => false);

      await expect(
        service.updateProfile('uuid-1', {
          newPassword: 'newPassword123',
          currentPassword: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException when newPassword provided without currentPassword', async () => {
      const user = makeMockUser();
      mockUserRepository.findOne!.mockResolvedValue(user);

      await expect(
        service.updateProfile('uuid-1', {
          newPassword: 'newPassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteMyAccount', () => {
    it('sets deletedAt when no active tickets and not blocked', async () => {
      const user = makeMockUser();
      mockUserRepository.findOne!.mockResolvedValue(user);
      (mockTicketRepository.count as jest.Mock).mockResolvedValue(0);
      mockUserRepository.save!.mockResolvedValue({
        ...user,
        deletedAt: new Date(),
      });

      await service.deleteMyAccount('uuid-1');

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });

    it('throws ConflictException when user is blocked', async () => {
      const user = { ...makeMockUser(), status: UserStatus.BLOCKED };
      mockUserRepository.findOne!.mockResolvedValue(user);

      await expect(service.deleteMyAccount('uuid-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when active tickets exist', async () => {
      const user = makeMockUser();
      mockUserRepository.findOne!.mockResolvedValue(user);
      (mockTicketRepository.count as jest.Mock).mockResolvedValue(1);

      await expect(service.deleteMyAccount('uuid-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateWallet', () => {
    it('should update stellarPublicKey correctly', async () => {
      const mockUser = makeMockUser();
      const publicKey = 'GABC123...';
      const updatedUser: User = { ...mockUser, stellarPublicKey: publicKey };

      mockUserRepository.findOne!.mockResolvedValue(mockUser);
      mockUserRepository.save!.mockResolvedValue(updatedUser);

      const result = await service.updateWallet('uuid-1', publicKey);

      expect(result.stellarPublicKey).toBe(publicKey);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.updateWallet('nonexistent', 'GABC...'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
