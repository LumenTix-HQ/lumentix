import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { BruteForceService } from '../services/brute-force.service';

@Injectable()
export class BruteForceGuard implements CanActivate {
  constructor(private readonly bruteForceService: BruteForceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const ip = request?.ip ?? request?.connection?.remoteAddress ?? '';

    if (!ip) {
      return true;
    }

    const locked = await this.bruteForceService.isLocked(ip);
    if (locked) {
      throw new ThrottlerException(
        'Too many requests from this IP, try again later.',
      );
    }

    return true;
  }
}
