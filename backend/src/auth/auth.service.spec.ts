import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'LINE_LOGIN_CHANNEL_ID') return 'line-channel-id';
      if (key === 'LINE_LOGIN_CHANNEL_SECRET') return 'line-secret';
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };

  const createFetchResponse = (body: unknown, status = 200) =>
    ({
      status,
      json: jest.fn().mockResolvedValue(body),
    }) as any;

  const createProfilesQuery = ({
    existingLineProfile = null,
    targetProfile = null,
    updateError = null,
  }: {
    existingLineProfile?: any;
    targetProfile?: any;
    updateError?: { message: string } | null;
  }) => {
    let eqField: string | null = null;

    const query: {
      select: jest.Mock;
      eq: jest.Mock;
      maybeSingle: jest.Mock;
      update: jest.Mock;
    } = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn((field: string) => {
        eqField = field;
        return query;
      }),
      maybeSingle: jest.fn(async () => {
        if (eqField === 'line_user_id') {
          return { data: existingLineProfile };
        }
        if (eqField === 'id') {
          return { data: targetProfile };
        }
        return { data: null };
      }),
      update: jest.fn((payload: Record<string, unknown>) => ({
        eq: jest.fn().mockResolvedValue({ error: updateError, data: payload }),
      })),
    };

    return query;
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('signs guest users into the existing line-local account when the LINE profile already exists', async () => {
    const profilesQuery = createProfilesQuery({
      existingLineProfile: { id: 'line-local-user' },
    });
    const signInWithPassword = jest.fn().mockResolvedValue({
      data: {
        user: { id: 'line-local-user', email: 'line_U123@line.local' },
        session: { access_token: 'guest-access', refresh_token: 'guest-refresh' },
      },
      error: null,
    });
    const supabaseService = {
      getClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue(profilesQuery),
        auth: { admin: { getUserById: jest.fn() } },
      }),
      getAuthClient: jest.fn().mockReturnValue({
        auth: {
          signInWithPassword,
          admin: { createUser: jest.fn() },
        },
      }),
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(createFetchResponse({ access_token: 'line-access' }))
      .mockResolvedValueOnce(
        createFetchResponse({ userId: 'U123', displayName: 'LINE Guest User' }),
      );

    const service = new AuthService(supabaseService as any, configService as any);
    const result = await service.handleLineLogin('oauth-code', 'https://api.test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'line_U123@line.local',
      password: expect.any(String),
    });
    expect(result).toEqual(
      expect.objectContaining({
        user: { id: 'line-local-user', email: 'line_U123@line.local' },
        access_token: 'guest-access',
        refresh_token: 'guest-refresh',
        lineUserId: 'U123',
      }),
    );
  });

  it('links the LINE profile to the existing Bread Shop user and preserves the existing session', async () => {
    const profilesQuery = createProfilesQuery({
      existingLineProfile: null,
      targetProfile: { id: 'bread-user-1', name: null, line_user_id: null },
    });
    const getUserById = jest.fn().mockResolvedValue({
      data: {
        user: { id: 'bread-user-1', email: 'bread@example.com' },
      },
      error: null,
    });
    const supabaseService = {
      getClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue(profilesQuery),
        auth: { admin: { getUserById } },
      }),
      getAuthClient: jest.fn().mockReturnValue({
        auth: {
          signInWithPassword: jest.fn(),
          admin: { createUser: jest.fn() },
        },
      }),
    };

    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(createFetchResponse({ access_token: 'line-access' }))
      .mockResolvedValueOnce(
        createFetchResponse({ userId: 'U999', displayName: 'LINE Linked User' }),
      );

    const service = new AuthService(supabaseService as any, configService as any);
    const result = await service.handleLineLogin('oauth-code', 'https://api.test', 'bread-user-1');

    expect(profilesQuery.update).toHaveBeenCalledWith({
      line_user_id: 'U999',
      name: 'LINE Linked User',
    });
    expect(getUserById).toHaveBeenCalledWith('bread-user-1');
    expect(result).toEqual(
      expect.objectContaining({
        user: { id: 'bread-user-1', email: 'bread@example.com' },
        access_token: '',
        refresh_token: '',
        lineUserId: 'U999',
        preserveExistingSession: true,
      }),
    );
  });

  it('rejects linking when the LINE account is already linked to another Bread Shop user', async () => {
    const profilesQuery = createProfilesQuery({
      existingLineProfile: { id: 'other-user' },
      targetProfile: { id: 'bread-user-1', name: 'Bread User', line_user_id: null },
    });
    const supabaseService = {
      getClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue(profilesQuery),
        auth: { admin: { getUserById: jest.fn() } },
      }),
      getAuthClient: jest.fn().mockReturnValue({
        auth: {
          signInWithPassword: jest.fn(),
          admin: { createUser: jest.fn() },
        },
      }),
    };

    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(createFetchResponse({ access_token: 'line-access' }))
      .mockResolvedValueOnce(
        createFetchResponse({ userId: 'U999', displayName: 'LINE Linked User' }),
      );

    const service = new AuthService(supabaseService as any, configService as any);

    await expect(
      service.handleLineLogin('oauth-code', 'https://api.test', 'bread-user-1'),
    ).rejects.toThrow(
      new BadRequestException('This LINE account is already linked to another user.'),
    );
  });
});
