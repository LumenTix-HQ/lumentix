import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: any;
  let jwtService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            createUser: jest.fn(),
            findByEmail: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('register', () => {
    const registerDto = { email: 'test@example.com', password: 'password123', role: 'user' } as any;

    it('should throw ConflictException if createUser throws', async () => {
      usersService.createUser.mockRejectedValue(new ConflictException());
      await expect(authService.register(registerDto)).rejects.toThrow(ConflictException);
    });

    it('should return access token on success', async () => {
      usersService.createUser.mockResolvedValue({ id: 'user-1', role: 'user' });
      jwtService.sign.mockReturnValue('token');

      const result = await authService.register(registerDto);

      expect(result).toEqual({ access_token: 'token' });
      expect(usersService.createUser).toHaveBeenCalledWith({
        email: registerDto.email,
        password: registerDto.password,
        role: registerDto.role,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-1', role: 'user' });
    });
  });

  describe('login', () => {
    const loginDto = { email: 'test@example.com', password: 'password123' } as any;

    it('should throw UnauthorizedException if user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      usersService.findByEmail.mockResolvedValue({ id: 'user-1', passwordHash: 'hash' });
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should return access token on success', async () => {
      usersService.findByEmail.mockResolvedValue({ id: 'user-1', role: 'user', passwordHash: 'hash' });
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      jwtService.sign.mockReturnValue('token');

      const result = await authService.login(loginDto);

      expect(result).toEqual({ access_token: 'token' });
      expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, 'hash');
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'user-1', role: 'user' });
    });
  });
});
