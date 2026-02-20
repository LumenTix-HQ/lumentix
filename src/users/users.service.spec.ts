import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcryptjs from 'bcryptjs';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';

const makeMockUser = (): User => ({
  id: 'uuid-1',
  email: 'test@example.com',
  passwordHash: 'hashed_password',
  role: UserRole.EVENT_GOER,
  stellarPublicKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

type MockRepository = Partial<Record<keyof Repository<User>, jest.Mock>>;

const createMockRepository = (): MockRepository => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let mockRepository: MockRepository;

  beforeEach(async () => {
    mockRepository = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('createUser', () => {
    it('should create a user with valid data and return without passwordHash', async () => {
      const mockUser = makeMockUser();
      mockRepository.findOne!.mockResolvedValue(null);
      mockRepository.create!.mockReturnValue(mockUser);
      mockRepository.save!.mockResolvedValue(mockUser);

      const result = await service.createUser({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('test@example.com');
    });

    it('should throw ConflictException when email already exists', async () => {
      mockRepository.findOne!.mockResolvedValue(makeMockUser());

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

      mockRepository.findOne!.mockResolvedValue(null);
      mockRepository.create!.mockImplementation((data: Partial<User>): User => {
        capturedHash = data.passwordHash;
        return { ...mockUser, ...data };
      });
      mockRepository.save!.mockImplementation(
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
      mockRepository.findOne!.mockResolvedValue(null);
      mockRepository.create!.mockImplementation(
        (data: Partial<User>): User => ({ ...mockUser, ...data }),
      );
      mockRepository.save!.mockImplementation(
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
      mockRepository.findOne!.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne!.mockResolvedValue(null);

      const result = await service.findByEmail('nobody@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user without passwordHash', async () => {
      mockRepository.findOne!.mockResolvedValue(makeMockUser());

      const result = await service.findById('uuid-1');

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockRepository.findOne!.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateWallet', () => {
    it('should update stellarPublicKey correctly', async () => {
      const mockUser = makeMockUser();
      const publicKey = 'GABC123...';
      const updatedUser: User = { ...mockUser, stellarPublicKey: publicKey };

      mockRepository.findOne!.mockResolvedValue(mockUser);
      mockRepository.save!.mockResolvedValue(updatedUser);

      const result = await service.updateWallet('uuid-1', publicKey);

      expect(result.stellarPublicKey).toBe(publicKey);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.updateWallet('nonexistent', 'GABC...'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
