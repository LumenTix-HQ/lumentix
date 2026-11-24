import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injects the authenticated user attached to the request by the JWT guard. */
export const AuthenticatedUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: unknown }>();
    return request.user;
  },
);
