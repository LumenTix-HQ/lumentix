import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../mailer/mailer.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: any;
  let jwtService: any;
  let configService: any;
  let mailerService: any;
  let passwordResetTokenRepository: any;
  let refreshTokenRepository: any;

  beforeEach(async () => {
    passwordResetTokenRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    refreshTokenRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            createUser: jest.fn(),
            findByEmail: jest.fn(),
            updatePassword: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:3000'),
          },
        },
        {
          provide: MailerService,
          useValue: {
            send: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: passwordResetTokenRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: { create: jest.fn(), save: jest.fn(), find: jest.fn() },
          useValue: refreshTokenRepository,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    mailerService = module.get(MailerService);
    // @InjectRepository uses string token in tests when manual provider is used
    passwordResetTokenRepository = module.get(
      getRepositoryToken(PasswordResetToken),
    );
    refreshTokenRepository = module.get(
      getRepositoryToken(RefreshToken),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'password123',
      role: 'user',
    } as any;

    it('should throw ConflictException if createUser throws', async () => {
      usersService.createUser.mockRejectedValue(new ConflictException());
      await expect(authService.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should return access token and refresh token on success', async () => {
      usersService.createUser.mockResolvedValue({ id: 'user-1', role: 'user' });
      jwtService.sign.mockReturnValue('token');
      refreshTokenRepository.create.mockReturnValue({ id: 'uuid-1', token: 'hash' });
      refreshTokenRepository.save.mockResolvedValue({ id: 'uuid-1', token: 'hash' });

      const result = await authService.register(registerDto);

      expect(result).toHaveProperty('accessToken', 'token');
      expect(result).toHaveProperty('refreshToken');
      expect(usersService.createUser).toHaveBeenCalledWith({
        email: registerDto.email,
        password: registerDto.password,
        role: registerDto.role,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        role: 'user',
      });
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'password123',
    } as any;

    it('should throw UnauthorizedException if user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(authService.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hash',
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(authService.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return access token and refresh token on success', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        role: 'user',
        passwordHash: 'hash',
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      jwtService.sign.mockReturnValue('token');
      refreshTokenRepository.create.mockReturnValue({ id: 'uuid-1', token: 'hash' });
      refreshTokenRepository.save.mockResolvedValue({ id: 'uuid-1', token: 'hash' });

      const result = await authService.login(loginDto);

      expect(result.access_token).toBe('token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('accessToken', 'token');
      expect(result).toHaveProperty('refreshToken');
      expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, 'hash');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        role: 'user',
      });
    });
  });

  describe('forgotPassword', () => {
    it('returns 200 when email not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await authService.forgotPassword({
        email: 'unknown@example.com',
      });

      expect(result).toEqual({
        message:
          'If the email exists, password reset instructions have been sent.',
      });
      expect(mailerService.send).not.toHaveBeenCalled();
    });

    it('creates token and sends mail when user exists', async () => {
      const user = { id: 'user-1', email: 'user@example.com' };
      usersService.findByEmail.mockResolvedValue(user);

      passwordResetTokenRepository.create.mockReturnValue({
        userId: user.id,
        tokenHash: '',
        expiresAt: expect.any(Date),
        used: false,
      });
      passwordResetTokenRepository.save
        .mockResolvedValueOnce({
          id: 'token-1',
          userId: user.id,
          tokenHash: '',
          expiresAt: new Date(Date.now() + 3600000),
          used: false,
        })
        .mockResolvedValueOnce({
          id: 'token-1',
          userId: user.id,
          tokenHash: 'hash',
          expiresAt: new Date(Date.now() + 3600000),
          used: false,
        });

      const result = await authService.forgotPassword({
        email: 'user@example.com',
      });

      expect(result).toEqual({
        message:
          'If the email exists, password reset instructions have been sent.',
      });
      expect(passwordResetTokenRepository.create).toHaveBeenCalledWith({
        userId: user.id,
        tokenHash: '',
        expiresAt: expect.any(Date),
        used: false,
      });
      expect(mailerService.send).toHaveBeenCalledWith(
        user.email,
        'Lumentix Password Reset',
        expect.stringContaining('Reset your password'),
      );
    });
  });

  describe('resetPassword', () => {
    it('throws on malformed token', async () => {
      await expect(
        authService.resetPassword({
          token: 'invalid-token',
          newPassword: 'newPass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on missing token entity', async () => {
      passwordResetTokenRepository.findOne.mockResolvedValue(null);
      await expect(
        authService.resetPassword({
          token: 'token-1:secret',
          newPassword: 'newPass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when token already used', async () => {
      passwordResetTokenRepository.findOne.mockResolvedValue({
        id: 'token-1',
        used: true,
        expiresAt: new Date(Date.now() + 3600000),
        tokenHash: 'hash',
        userId: 'user-1',
      });
      await expect(
        authService.resetPassword({
          token: 'token-1:secret',
          newPassword: 'newPass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when token expired', async () => {
      passwordResetTokenRepository.findOne.mockResolvedValue({
        id: 'token-1',
        used: false,
        expiresAt: new Date(Date.now() - 1000),
        tokenHash: 'hash',
        userId: 'user-1',
      });
      await expect(
        authService.resetPassword({
          token: 'token-1:secret',
          newPassword: 'newPass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('resets password when token valid', async () => {
      passwordResetTokenRepository.findOne.mockResolvedValue({
        id: 'token-1',
        used: false,
        expiresAt: new Date(Date.now() + 3600000),
        tokenHash: '$2a$10$validhash',
        userId: 'user-1',
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      usersService.updatePassword.mockResolvedValue({ id: 'user-1' });

      const result = await authService.resetPassword({
        token: 'token-1:secret',
        newPassword: 'newPass123',
      });

      expect(result).toEqual({
        message: 'Password has been reset successfully.',
      });
      expect(usersService.updatePassword).toHaveBeenCalledWith(
        'user-1',
        'newPass123',
      );
      expect(passwordResetTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ used: true }),
      );
    });
  });

  describe('refresh', () => {
    it('throws on invalid token format', async () => {
      await expect(authService.refresh('invalid_format')).rejects.toThrow(UnauthorizedException);
    });

    it('throws on invalid token', async () => {
      refreshTokenRepository.findOne.mockResolvedValue(null);
      await expect(authService.refresh('id:secret')).rejects.toThrow(UnauthorizedException);
    });

    it('refreshes successfully', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1); // tomorrow

      refreshTokenRepository.findOne.mockResolvedValue({
        id: 'id',
        token: 'hash',
        userId: 'user-1',
        expiresAt,
        revoked: false,
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      usersService.findById.mockResolvedValue({ id: 'user-1', role: 'user' });
      jwtService.sign.mockReturnValue('new_token');
      refreshTokenRepository.create.mockReturnValue({ id: 'uuid-2', token: 'hash2' });
      refreshTokenRepository.save.mockResolvedValue({ id: 'uuid-2', token: 'hash2' });

      const result = await authService.refresh('id:secret');
      expect(result).toHaveProperty('accessToken', 'new_token');
      expect(result).toHaveProperty('refreshToken');
    });
  });

  describe('logout', () => {
    it('revokes the token', async () => {
      const tokenRecord = {
        id: 'id',
        token: 'hash',
        revoked: false,
      };
      refreshTokenRepository.findOne.mockResolvedValue(tokenRecord);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      await authService.logout('id:secret');
      expect(tokenRecord.revoked).toBe(true);
      expect(refreshTokenRepository.save).toHaveBeenCalledWith(tokenRecord);
    });
  });
});
