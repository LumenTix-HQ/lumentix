import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
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
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have throttler metadata applied to register', () => {
    const throttle = Reflect.getMetadata('THROTTLER:METADATA', AuthController.prototype.register);
    expect(throttle).toBeDefined();
    expect(throttle[0].short.limit).toBe(5);
    expect(throttle[0].short.ttl).toBe(60000);
  });

  it('should have throttler metadata applied to login', () => {
    const throttle = Reflect.getMetadata('THROTTLER:METADATA', AuthController.prototype.login);
    expect(throttle).toBeDefined();
    expect(throttle[0].short.limit).toBe(5);
    expect(throttle[0].short.ttl).toBe(60000);
  });
});
