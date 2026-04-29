/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { BruteForceService } from '../common/services/brute-force.service';
import { BruteForceGuard } from '../common/guards/brute-force.guard';

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
            create: jest.fn(),
            findOne: jest.fn(),
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
          provide: BruteForceService,
          useValue: {
            reset: jest.fn(),
            recordFailedAttempt: jest.fn(),
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
      .mockResolvedValue({ access_token: 'token' } as any);

    const loginDto = { email: 'x', password: 'y' } as unknown as any;
    const request = { ip: '1.1.1.1' } as unknown as Request;

    const result = await controller.login(loginDto, request);
    expect(result).toEqual({ access_token: 'token' });
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
