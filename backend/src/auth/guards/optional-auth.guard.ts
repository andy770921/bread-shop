import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const supabase = this.supabaseService.getClient();
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user) {
        request.user = user;
      }
    }

    return true;
  }
}
