import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const SessionId = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.sessionId;
});
