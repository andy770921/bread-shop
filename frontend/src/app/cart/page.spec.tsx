import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CartPage from './page';

const push = jest.fn();
const replace = jest.fn();
const invalidateQueries = jest.fn().mockResolvedValue(undefined);
const createOrder = jest.fn();
const lineSend = jest.fn();
const confirmOrder = jest.fn();

const translations: Record<string, string> = {
  'cart.title': 'Shopping Cart',
  'cart.empty': 'Your cart is empty',
  'cart.emptyDesc': 'Empty',
  'cart.startShopping': 'Start Shopping',
  'cart.customerInfo': 'Customer Info',
  'cart.paymentInfo': 'Payment Info',
  'cart.name': 'Name',
  'cart.phone': 'Phone',
  'cart.email': 'Email',
  'cart.address': 'Address',
  'cart.notes': 'Notes',
  'cart.paymentMethod': 'Payment Method',
  'cart.paymentMethodPlaceholder': 'Select payment method',
  'cart.paymentCreditCard': 'Credit Card',
  'cart.creditCardServicePending': 'Credit card service application in progress',
  'cart.paymentLineTransfer': 'LINE Contact, Bank Transfer',
  'cart.lineId': 'Your LINE ID',
  'cart.lineIdPlaceholder': 'Enter your LINE ID',
  'cart.linePay': 'Contact via LINE',
  'cart.lineLinked':
    'LINE account linked. Order confirmation will be sent to your LINE automatically.',
  'cart.lineLoginHint': "You'll be redirected to LINE Login to enable automatic order confirmation",
  'cart.orderSummary': 'Order Summary',
  'cart.subtotal': 'Subtotal',
  'cart.shipping': 'Shipping',
  'cart.freeShipping': 'Free Shipping',
  'cart.freeShippingNote': 'Free shipping on orders over NT$500',
  'cart.total': 'Total',
  'cart.continueShopping': 'Continue Shopping',
  'checkout.checkoutFailed': 'Checkout failed',
};

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const imgProps = { ...props };
    delete imgProps.fill;

    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={imgProps.alt} {...imgProps} />;
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('@/hooks/use-locale', () => ({
  useLocale: jest.fn(),
}));

jest.mock('@/queries/use-cart', () => ({
  useCart: jest.fn(),
  useUpdateCartItem: jest.fn(),
  useRemoveCartItem: jest.fn(),
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/queries/use-checkout', () => ({
  useCreateOrder: jest.fn(),
  useLineSend: jest.fn(),
  useConfirmOrder: jest.fn(),
}));

jest.mock('@/utils/fetchers/fetchers.client', () => ({
  authedFetchFn: jest.fn(),
}));

jest.mock('@/components/layout/header', () => ({
  Header: () => <div>Header</div>,
}));

jest.mock('@/components/layout/footer', () => ({
  Footer: () => <div>Footer</div>,
}));

jest.mock('@/components/shared/error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

describe('[cart checkout e2e regression]', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const { useRouter, useSearchParams } = jest.requireMock('next/navigation');
    const { useQueryClient } = jest.requireMock('@tanstack/react-query');
    const { useLocale } = jest.requireMock('@/hooks/use-locale');
    const { useCart, useUpdateCartItem, useRemoveCartItem } =
      jest.requireMock('@/queries/use-cart');
    const { useAuth } = jest.requireMock('@/lib/auth-context');
    const { useCreateOrder, useLineSend, useConfirmOrder } =
      jest.requireMock('@/queries/use-checkout');
    const { authedFetchFn } = jest.requireMock('@/utils/fetchers/fetchers.client');

    useRouter.mockReturnValue({ push, replace });
    useSearchParams.mockReturnValue(new URLSearchParams());
    useQueryClient.mockReturnValue({ invalidateQueries });
    useLocale.mockReturnValue({
      locale: 'en',
      t: (key: string) => translations[key] || key,
    });
    useCart.mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            product_id: 101,
            quantity: 1,
            line_total: 220,
            product: {
              name_zh: '麵包',
              name_en: 'Bread',
              price: 220,
              image_url: '/bread.jpg',
            },
          },
        ],
        subtotal: 220,
        shipping_fee: 60,
        total: 280,
      },
      isLoading: false,
    });
    useUpdateCartItem.mockReturnValue({ updateItem: jest.fn() });
    useRemoveCartItem.mockReturnValue({ mutate: jest.fn() });
    useAuth.mockReturnValue({ user: { line_user_id: 'line-user-1' } });
    useCreateOrder.mockReturnValue({ mutateAsync: createOrder });
    useLineSend.mockReturnValue({ mutateAsync: lineSend });
    useConfirmOrder.mockReturnValue({ mutateAsync: confirmOrder });
    authedFetchFn.mockResolvedValue({
      can_receive_messages: false,
      add_friend_url: 'https://line.me/R/ti/p/@737nfsrc',
    });
  });

  it('keeps blocked linked users out of the success page and redirects to checkout failed', async () => {
    render(<CartPage />);

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'line_transfer' },
    });

    fireEvent.change(screen.getByPlaceholderText('Name'), {
      target: { value: 'Andy' },
    });
    fireEvent.change(screen.getByPlaceholderText('Phone'), {
      target: { value: '0912345678' },
    });
    fireEvent.change(screen.getByPlaceholderText('Address'), {
      target: { value: 'Taipei' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your LINE ID'), {
      target: { value: '@andy' },
    });

    const submitButton = screen.getByRole('button', { name: 'Contact via LINE' });

    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/checkout/failed?reason=not_friend');
    });

    const { authedFetchFn } = jest.requireMock('@/utils/fetchers/fetchers.client');
    expect(authedFetchFn).toHaveBeenCalledWith('api/auth/line/message-eligibility');
    expect(createOrder).not.toHaveBeenCalled();
    expect(lineSend).not.toHaveBeenCalled();
    expect(confirmOrder).not.toHaveBeenCalled();
  });

  it('shows the credit-card service pending notice instead of checkout inputs', () => {
    render(<CartPage />);

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'credit_card' },
    });

    expect(screen.getByText('Credit card service application in progress')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contact via LINE' })).not.toBeInTheDocument();
  });
});
