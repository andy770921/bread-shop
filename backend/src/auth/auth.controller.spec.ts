import { createHmac } from 'crypto';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const frontendUrl = 'https://shop.test';
  const channelSecret = 'line-secret';

  let controller: AuthController;
  let authService: {
    storePendingOrder: jest.Mock;
    readPendingOrder: jest.Mock;
    handleLineLogin: jest.Mock;
    updatePendingOrderAuth: jest.Mock;
    deletePendingOrder: jest.Mock;
    mergeSessionOnLogin: jest.Mock;
    consumeOneTimeCode: jest.Mock;
  };
  let supabaseService: {
    getClient: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
    getOrThrow: jest.Mock;
  };
  let orderService: {
    getCartForSession: jest.Mock;
  };
  let checkoutService: {
    completePendingLineCheckout: jest.Mock;
  };

  const createResponse = (): Response =>
    ({
      redirect: jest.fn(),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
      writeHead: jest.fn(),
      write: jest.fn(),
      flushHeaders: jest.fn(),
    }) as unknown as Response;

  const createRequest = (
    overrides: Partial<Request> & {
      headers?: Record<string, string>;
      sessionId?: string;
      protocol?: string;
      host?: string;
    } = {},
  ): Request =>
    ({
      headers: overrides.headers || {},
      sessionId: overrides.sessionId || 'session-1',
      protocol: overrides.protocol || 'http',
      get: jest.fn().mockImplementation((name: string) => {
        if (name === 'host') {
          return overrides.host || 'api.test';
        }
        return undefined;
      }),
      ...overrides,
    }) as unknown as Request;

  const createPendingState = (pendingId: string) => {
    const sig = createHmac('sha256', channelSecret).update(pendingId).digest('hex').slice(0, 16);
    return `${pendingId}.${sig}`;
  };

  beforeEach(() => {
    authService = {
      storePendingOrder: jest.fn(),
      readPendingOrder: jest.fn(),
      handleLineLogin: jest.fn(),
      updatePendingOrderAuth: jest.fn(),
      deletePendingOrder: jest.fn(),
      mergeSessionOnLogin: jest.fn(),
      consumeOneTimeCode: jest.fn(),
    };

    supabaseService = {
      getClient: jest.fn().mockReturnValue({
        auth: {
          getUser: jest.fn(),
        },
      }),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'FRONTEND_URL') return frontendUrl;
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'LINE_LOGIN_CHANNEL_SECRET') return channelSecret;
        if (key === 'LINE_LOGIN_CHANNEL_ID') return 'line-channel-id';
        if (key === 'LINE_CHANNEL_ACCESS_TOKEN') return 'bot-token';
        throw new Error(`Unexpected config key: ${key}`);
      }),
    };

    orderService = {
      getCartForSession: jest.fn(),
    };

    checkoutService = {
      completePendingLineCheckout: jest.fn(),
    };

    controller = new AuthController(
      authService as any,
      supabaseService as any,
      configService as any,
      orderService as any,
      checkoutService as any,
    );
  });

  describe('lineStart', () => {
    it('stores guest pending orders without a link user id', async () => {
      const cartSnapshot = { items: [{ id: 1 }], subtotal: 100, shipping_fee: 60, total: 160 };
      const req = createRequest();

      orderService.getCartForSession.mockResolvedValue(cartSnapshot);
      authService.storePendingOrder.mockResolvedValue('pending-1');

      await controller.lineStart(req, {
        form_data: {
          customerName: 'Guest',
          lineId: 'guest-line-id',
          _link_user_id: 'should-be-stripped',
        },
      });

      expect(authService.storePendingOrder).toHaveBeenCalledWith('session-1', {
        customerName: 'Guest',
        lineId: 'guest-line-id',
        _cart_snapshot: cartSnapshot,
      });
    });

    it('stores the current Bread Shop user id for linking flows', async () => {
      const cartSnapshot = { items: [], subtotal: 0, shipping_fee: 0, total: 0 };
      const req = createRequest({
        headers: { authorization: 'Bearer existing-token' },
      });
      const getUser = jest.fn().mockResolvedValue({
        data: { user: { id: 'bread-user-1' } },
        error: null,
      });

      supabaseService.getClient.mockReturnValue({
        auth: { getUser },
      });
      orderService.getCartForSession.mockResolvedValue(cartSnapshot);
      authService.storePendingOrder.mockResolvedValue('pending-2');

      await controller.lineStart(req, {
        form_data: { customerName: 'Linked User' },
      });

      expect(getUser).toHaveBeenCalledWith('existing-token');
      expect(authService.storePendingOrder).toHaveBeenCalledWith('session-1', {
        customerName: 'Linked User',
        _cart_snapshot: cartSnapshot,
        _link_user_id: 'bread-user-1',
      });
    });
  });

  describe('lineCallback', () => {
    it('redirects guest users to the pending page with auth tokens when the bot is not yet added', async () => {
      const res = createResponse();
      const req = createRequest({
        headers: { 'x-forwarded-proto': 'https' },
      });

      authService.readPendingOrder.mockResolvedValue({
        session_id: 'session-1',
        form_data: {},
      });
      authService.handleLineLogin.mockResolvedValue({
        user: { id: 'line-local-user', email: 'line_user@line.local' },
        access_token: 'guest-access',
        refresh_token: 'guest-refresh',
        lineAccessToken: 'line-access',
        lineUserId: 'line-user-id',
      });
      authService.updatePendingOrderAuth.mockResolvedValue(undefined);

      jest.spyOn(controller as any, 'checkLineFriendship').mockResolvedValue(false);

      await controller.lineCallback(
        'oauth-code',
        createPendingState('pending-guest'),
        undefined,
        req,
        res,
      );

      expect(authService.handleLineLogin).toHaveBeenCalledWith(
        'oauth-code',
        'https://api.test',
        undefined,
      );
      expect(authService.updatePendingOrderAuth).toHaveBeenCalledWith('pending-guest', {
        lineUserId: 'line-user-id',
        userId: 'line-local-user',
      });
      expect((res.redirect as jest.Mock).mock.calls[0][0]).toBe(
        `${frontendUrl}/checkout/pending?pendingId=pending-guest#access_token=guest-access&refresh_token=guest-refresh`,
      );
    });

    it('redirects guest LINE login from the login page back to auth callback with tokens', async () => {
      const res = createResponse();
      const req = createRequest({
        headers: { 'x-forwarded-proto': 'https' },
      });

      authService.handleLineLogin.mockResolvedValue({
        user: { id: 'line-local-user', email: 'line_user@line.local' },
        access_token: 'guest-access',
        refresh_token: 'guest-refresh',
        lineAccessToken: 'line-access',
        lineUserId: 'line-user-id',
      });

      await controller.lineCallback('oauth-code', 'random-state', undefined, req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Location',
        `${frontendUrl}/auth/callback#access_token=guest-access&refresh_token=guest-refresh&user_id=line-local-user&email=line_user%40line.local`,
      );
      expect(res.status).toHaveBeenCalledWith(302);
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('confirmLineOrder', () => {
    it('allows authenticated LINE guests to submit from the pending page and reach success', async () => {
      const pending = {
        session_id: 'session-1',
        form_data: {
          _user_id: 'line-local-user',
          _line_user_id: 'line-user-id',
        },
      };

      authService.readPendingOrder.mockResolvedValue(pending);
      authService.deletePendingOrder.mockResolvedValue(pending);
      jest.spyOn(controller as any, 'checkLineFriendship').mockResolvedValue(true);
      checkoutService.completePendingLineCheckout.mockResolvedValue(
        `${frontendUrl}/checkout/success?order=ORD-0001`,
      );

      const result = await controller.confirmLineOrder(
        { pendingId: 'pending-guest' },
        { id: 'line-local-user', email: 'line_user@line.local' },
      );

      expect(checkoutService.completePendingLineCheckout).toHaveBeenCalledWith({
        pending,
        authResult: {
          user: { id: 'line-local-user', email: 'line_user@line.local' },
          access_token: '',
          refresh_token: '',
        },
        frontendUrl,
      });
      expect(result).toEqual({ success: true, order_number: 'ORD-0001' });
    });
  });
});
