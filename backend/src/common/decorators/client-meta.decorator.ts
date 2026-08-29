import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ClientMeta = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return {
    ip: request.ip || request.headers['x-forwarded-for'] || '127.0.0.1',
    userAgent: request.headers['user-agent'] || 'Unknown',
  };
});
