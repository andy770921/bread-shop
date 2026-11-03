import { Test, TestingModule } from '@nestjs/testing';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

function makeSupabase(result: QueryResult) {
  const limit = jest.fn().mockResolvedValue(result);
  const select = jest.fn(() => ({ limit }));
  const from = jest.fn(() => ({ select }));
  const supabase = { getClient: () => ({ from }) } as unknown as SupabaseService;
  return { supabase, from, select, limit };
}

describe('AppController', () => {
  const createController = async (supabase: SupabaseService) => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: SupabaseService, useValue: supabase }],
    }).compile();

    return app.get<AppController>(AppController);
  };

  describe('health', () => {
    it('should return health status', async () => {
      const { supabase } = makeSupabase({ data: [], error: null });
      const appController = await createController(supabase);

      const health = appController.getHealth();
      expect(health.status).toBe('ok');
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('database health', () => {
    let loggerError: jest.SpyInstance;

    beforeEach(() => {
      loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });

    afterEach(() => {
      loggerError.mockRestore();
    });

    it('should query the categories table and return ok', async () => {
      const { supabase, from, limit } = makeSupabase({ data: [{ id: 1 }], error: null });
      const appController = await createController(supabase);

      const health = await appController.getDatabaseHealth();

      expect(from).toHaveBeenCalledWith('categories');
      expect(limit).toHaveBeenCalledWith(1);
      expect(health.status).toBe('ok');
      expect(health.timestamp).toBeDefined();
    });

    it('should throw 503 when the query fails', async () => {
      const { supabase } = makeSupabase({ data: null, error: { message: 'connection refused' } });
      const appController = await createController(supabase);

      await expect(appController.getDatabaseHealth()).rejects.toThrow(ServiceUnavailableException);
    });

    it('should log driver error details instead of returning them', async () => {
      const { supabase } = makeSupabase({ data: null, error: { message: 'connection refused' } });
      const appController = await createController(supabase);

      await expect(appController.getDatabaseHealth()).rejects.toThrow('Database is unreachable');
      expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
    });
  });
});
