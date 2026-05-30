import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.id;

    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'emailVerified'],
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Email address not verified. Please verify your email before accessing this resource.',
      );
    }

    return true;
  }
}
