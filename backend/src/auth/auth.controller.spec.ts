/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../mailer/mailer.service';
import { BruteForceService } from '../common/services/brute-force.service';
import { BruteForceGuard } from '../common/guards/brute-force.guard';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { WalletChallenge } from './entities/wallet-challenge.entity';

describe('AuthController', () => {
  let controller: AuthController;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        BruteForceGuard,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            createUser: jest.fn(),
            updatePassword: jest.fn(),
            updateWallet: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
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
          provide: BruteForceService,
          useValue: {
            reset: jest.fn(),
            recordFailedAttempt: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WalletChallenge),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should include login and register endpoints', () => {
    expect(AuthController.prototype.register).toBeDefined();
    expect(AuthController.prototype.login).toBeDefined();
  });

  it('should reset brute force on successful login', async () => {
    const authService = module.get<AuthService>(AuthService);
    const bruteForceService = module.get<BruteForceService>(BruteForceService);
    jest
      .spyOn(authService, 'login')
      .mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh' } as any);

    const loginDto = { email: 'x', password: 'y' } as unknown as any;
    const request = { ip: '1.1.1.1' } as unknown as Request;

    const result = await controller.login(loginDto, request);
    expect(result).toEqual({ accessToken: 'token', refreshToken: 'refresh' });
    expect(bruteForceService.reset).toHaveBeenCalledWith('1.1.1.1');
  });

  it('should record failed attempt on unauthorized login', async () => {
    const authService = module.get<AuthService>(AuthService);
    const bruteForceService = module.get<BruteForceService>(BruteForceService);
    jest
      .spyOn(authService, 'login')
      .mockRejectedValueOnce(new UnauthorizedException());

    const loginDto = { email: 'x', password: 'y' } as unknown as any;
    const request = { ip: '2.2.2.2' } as unknown as Request;

    await expect(controller.login(loginDto, request)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bruteForceService.recordFailedAttempt).toHaveBeenCalledWith(
      '2.2.2.2',
    );
  });
});
