import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User authentication required');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('Email not verified. Please verify your email before proceeding.');
    }

    return true;
  }
}
