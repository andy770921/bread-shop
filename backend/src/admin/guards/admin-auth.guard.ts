import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

const ADMIN_ROLES = ['admin', 'owner'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const token = header.split(' ')[1];
    const supabase = this.supabaseService.getClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) throw new UnauthorizedException('Invalid or expired token');

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    const role = profile?.role as AdminRole | 'customer' | undefined;
    if (!role || !ADMIN_ROLES.includes(role as AdminRole)) {
      throw new ForbiddenException('No admin access');
    }

    req.user = { id: user.id, email: user.email ?? '', role };
    return true;
  }
}
