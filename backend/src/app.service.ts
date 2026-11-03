import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { HealthResponseDto } from './dto/health-response.dto';
import { SupabaseService } from './supabase/supabase.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private supabaseService: SupabaseService) {}

  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /** Runs a minimal read against the `categories` table. Each call also counts as database
   *  activity, which is what keeps a Supabase Free-plan project from being paused. */
  async getDatabaseHealth(): Promise<HealthResponseDto> {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.from('categories').select('id').limit(1);

    if (error) {
      // Keep driver details in the logs; this endpoint is public.
      this.logger.error(`Database health check failed: ${error.message}`);
      throw new ServiceUnavailableException('Database is unreachable');
    }

    return this.getHealth();
  }
}
