import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient;
  private authClient: SupabaseClient;

  constructor(private configService: ConfigService) {
    const url = this.configService.getOrThrow('SUPABASE_URL');
    const key = this.configService.getOrThrow('SUPABASE_SERVICE_KEY');
    const opts = { auth: { autoRefreshToken: false, persistSession: false } };

    // Data client: used for .from() queries. NEVER call auth.signInWithPassword on this.
    this.client = createClient(url, key, opts);

    // Auth client: used for auth.signInWithPassword / auth.admin.*. Its in-memory
    // session gets contaminated after signInWithPassword, which changes the role
    // from service_role to authenticated — breaking RLS on subsequent queries.
    // By isolating auth calls to a separate client, the data client stays clean.
    this.authClient = createClient(url, key, opts);
  }

  /** For data operations (.from().select/insert/update/delete). Always service_role. */
  getClient(): SupabaseClient {
    return this.client;
  }

  /** For auth operations (signInWithPassword, admin.createUser). May be contaminated. */
  getAuthClient(): SupabaseClient {
    return this.authClient;
  }
}
