'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  CreditCard,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { ProductImage } from '@/components/product/product-image';
import { useLocale } from '@/hooks/use-locale';
import { pickLocalizedText } from '@/i18n/utils';
import { QUERY_KEYS } from '@/queries/query-keys';
import { flushPendingCartMutations } from '@/queries/use-debounced-cart-mutation';
import { useCart, useUpdateCartItem, useRemoveCartItem } from '@/queries/use-cart';
import { CartFormValues, cartFormSchema } from '@/features/checkout/cart-form';
import {
  extractCheckoutErrorMessage,
  useCheckoutFlow,
} from '@/features/checkout/use-checkout-flow';
import { useCartContactDraftSync } from '@/features/checkout/use-cart-contact-draft-sync';

export default function CartPage() {
  return (
    <Suspense>
      <CartContent />
    </Suspense>
  );
}

function CartContent() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: cart, isLoading } = useCart();
  const { updateItem } = useUpdateCartItem();
  const removeCartItem = useRemoveCartItem();
  const { hasLineUserId, submitCheckout } = useCheckoutFlow();
  const [isCartSyncing, setIsCartSyncing] = useState(true);

  const form = useForm<CartFormValues>({
    resolver: zodResolver(cartFormSchema),
    mode: 'onChange',
    defaultValues: {
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      customerAddress: '',
      notes: '',
      paymentMethod: undefined,
      lineId: '',
    },
  });

  const { isDraftHydrating, flushDraftNow } = useCartContactDraftSync(form);
  const selectedPayment = form.watch('paymentMethod');
  const previousSelectedPaymentRef = useRef<CartFormValues['paymentMethod']>();

  // Show error from callback redirect (e.g. order creation failed after LINE Login)
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      toast.error(error);
      // Clean the error from URL without triggering navigation
      router.replace('/cart', { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    let cancelled = false;

    const syncCart = async () => {
      try {
        await flushPendingCartMutations();
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart });
      } finally {
        if (!cancelled) {
          setIsCartSyncing(false);
        }
      }
    };

    void syncCart();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  // Reset conditional fields when payment method changes
  useEffect(() => {
    const previousSelectedPayment = previousSelectedPaymentRef.current;
    const switchedAwayFromLineTransfer =
      previousSelectedPayment === 'line_transfer' && selectedPayment !== 'line_transfer';

    if (switchedAwayFromLineTransfer) {
      form.setValue('lineId', '');
      form.clearErrors('lineId');
    }

    previousSelectedPaymentRef.current = selectedPayment;
  }, [selectedPayment, form]);

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal ?? 0;
  const shippingFee = cart?.shipping_fee ?? 0;
  const total = cart?.total ?? 0;
  const hasIncompleteCachedItems = items.some((item) => {
    const hasMissingLocalizedName = !item.product.name_zh.trim() && !item.product.name_en.trim();
    const isSyntheticPendingItem = typeof item.id === 'number' && item.id < 0;
    return hasMissingLocalizedName || isSyntheticPendingItem;
  });
  const showLoadingState =
    isLoading || (isCartSyncing && (items.length === 0 || hasIncompleteCachedItems));

  const handleQuantityChange = (itemId: number | string, newQuantity: number) => {
    if (newQuantity < 1) return;
    updateItem(itemId, newQuantity);
  };

  const handleRemove = (itemId: number | string) => {
    removeCartItem.mutate(itemId, {
      onSuccess: () => {
        toast.success(t('cart.remove'));
      },
    });
  };

  const onSubmit = async (values: CartFormValues) => {
    try {
      const result = await submitCheckout(values);

      if (result.status === 'needs_friend') {
        router.push('/checkout/failed?reason=not_friend');
      }
    } catch (error) {
      const message = extractCheckoutErrorMessage(error);
      toast.error(message || t('checkout.checkoutFailed'));
    }
  };

  const submitting = form.formState.isSubmitting;
  const cartUiDisabled = submitting || isCartSyncing || isDraftHydrating;

  // Empty state
  if (!showLoadingState && items.length === 0) {
    return (
      <ErrorBoundary>
        <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
          <Header />
          <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24">
            <ShoppingBag className="h-16 w-16" style={{ color: 'var(--neutral-400)' }} />
            <h1
              className="font-heading text-2xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('cart.empty')}
            </h1>
            <p className="text-center" style={{ color: 'var(--text-secondary)' }}>
              {t('cart.emptyDesc')}
            </p>
            <Link href="/">
              <Button
                size="lg"
                className="rounded-full px-8"
                style={{ backgroundColor: 'var(--primary-500)', color: '#fff' }}
              >
                {t('cart.startShopping')}
              </Button>
            </Link>
          </main>
          <Footer />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <h1
            className="font-heading mb-8 text-2xl font-bold lg:text-3xl"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('cart.title')}
          </h1>

          {showLoadingState ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-8 lg:flex-row">
              {/* Left Column: Items + Form */}
              <div className="flex-1 space-y-6">
                {/* Cart Items */}
                <div className="space-y-4">
                  {items.map((item) => {
                    const name = pickLocalizedText(locale, {
                      zh: item.product.name_zh,
                      en: item.product.name_en,
                    });

                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-4 rounded-xl border p-4"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-light)',
                        }}
                      >
                        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg">
                          <ProductImage
                            src={item.product.image_url}
                            alt={name}
                            sizes="80px"
                            imageClassName="object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <h3
                            className="font-heading text-sm font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {name}
                          </h3>
                          <p className="text-sm" style={{ color: 'var(--primary-500)' }}>
                            NT${item.product.price}
                          </p>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon-xs"
                              onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                              disabled={item.quantity <= 1 || isCartSyncing}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span
                              className="w-8 text-center text-sm font-medium"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon-xs"
                              onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                              disabled={isCartSyncing}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <span
                            className="text-sm font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            NT${item.line_total}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRemove(item.id)}
                          aria-label={t('cart.remove')}
                          disabled={isCartSyncing}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Form: Customer Info + Payment Info */}
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* Customer Info Section */}
                    <div
                      className="space-y-4 rounded-xl border p-6"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-light)',
                      }}
                    >
                      <h2
                        className="font-heading text-lg font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {t('cart.customerInfo')}
                      </h2>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="customerName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('cart.name')} *</FormLabel>
                              <FormControl>
                                <Input placeholder={t('cart.name')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="customerPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('cart.phone')} *</FormLabel>
                              <FormControl>
                                <Input placeholder={t('cart.phone')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="customerEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('cart.email')}</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder={t('cart.email')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="customerAddress"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('cart.address')} *</FormLabel>
                              <FormControl>
                                <Input placeholder={t('cart.address')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('cart.notes')}</FormLabel>
                            <FormControl>
                              <Textarea placeholder={t('cart.notes')} rows={3} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Payment Info Section */}
                    <div
                      className="space-y-4 rounded-xl border p-6"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-light)',
                      }}
                    >
                      <h2
                        className="font-heading text-lg font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {t('cart.paymentInfo')}
                      </h2>

                      {/* Payment Method Dropdown */}
                      <FormField
                        control={form.control}
                        name="paymentMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('cart.paymentMethod')} *</FormLabel>
                            <FormControl>
                              <select
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value || undefined)}
                                onBlur={field.onBlur}
                                className="flex h-10 w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
                                style={{
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-default)',
                                  color: field.value
                                    ? 'var(--text-primary)'
                                    : 'var(--text-tertiary)',
                                }}
                              >
                                <option value="">{t('cart.paymentMethodPlaceholder')}</option>
                                <option value="credit_card">{t('cart.paymentCreditCard')}</option>
                                <option value="line_transfer">
                                  {t('cart.paymentLineTransfer')}
                                </option>
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Credit Card Notice */}
                      {selectedPayment === 'credit_card' && (
                        <div
                          className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm"
                          style={{
                            backgroundColor: 'var(--bg-body)',
                            borderColor: 'var(--border-default)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <CreditCard className="h-4 w-4 flex-shrink-0" />
                          <span>{t('cart.creditCardServicePending')}</span>
                        </div>
                      )}

                      {/* LINE Transfer Fields */}
                      {selectedPayment === 'line_transfer' && (
                        <>
                          {/* Green notice when LINE account is linked */}
                          {hasLineUserId && (
                            <div
                              className="flex items-center gap-2 rounded-lg p-3 text-sm"
                              style={{
                                backgroundColor: 'var(--success-50, #f0fdf4)',
                                color: 'var(--success-700, #15803d)',
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                              {t('cart.lineLinked')}
                            </div>
                          )}

                          {/* LINE ID field — required for LINE transfer */}
                          <FormField
                            control={form.control}
                            name="lineId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('cart.lineId')} *</FormLabel>
                                <FormControl>
                                  <Input placeholder={t('cart.lineIdPlaceholder')} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {/* CTA Button */}
                      {selectedPayment === 'line_transfer' && (
                        <>
                          <Button
                            type="submit"
                            variant="outline"
                            className="w-full gap-2 rounded-full"
                            size="lg"
                            style={{ borderColor: '#06C755', color: '#06C755' }}
                            disabled={!form.formState.isValid || cartUiDisabled}
                          >
                            <MessageCircle className="h-4 w-4" />
                            {t('cart.linePay')}
                          </Button>
                          {!hasLineUserId && (
                            <p
                              className="text-center text-xs"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              {t('cart.lineLoginHint')}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </form>
                </Form>

                {/* Continue Shopping */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await flushDraftNow();
                    router.push('/');
                  }}
                >
                  &larr; {t('cart.continueShopping')}
                </Button>
              </div>

              {/* Right Column: Order Summary */}
              <div className="w-full lg:w-[380px]">
                <div
                  className="sticky top-24 space-y-4 rounded-xl border p-6"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-light)',
                  }}
                >
                  <h2
                    className="font-heading text-lg font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {t('cart.orderSummary')}
                  </h2>

                  {/* Line items */}
                  <div className="space-y-2">
                    {items.map((item) => {
                      const name = pickLocalizedText(locale, {
                        zh: item.product.name_zh,
                        en: item.product.name_en,
                      });
                      return (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {name} x{item.quantity}
                          </span>
                          <span style={{ color: 'var(--text-primary)' }}>NT${item.line_total}</span>
                        </div>
                      );
                    })}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>{t('cart.subtotal')}</span>
                      <span style={{ color: 'var(--text-primary)' }}>NT${subtotal}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>{t('cart.shipping')}</span>
                      <span
                        style={{
                          color: shippingFee === 0 ? 'var(--success-500)' : 'var(--text-primary)',
                        }}
                      >
                        {shippingFee === 0 ? t('cart.freeShipping') : `NT$${shippingFee}`}
                      </span>
                    </div>
                    {shippingFee > 0 && (
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {t('cart.freeShippingNote')}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="flex justify-between">
                    <span
                      className="font-heading text-lg font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {t('cart.total')}
                    </span>
                    <span
                      className="font-heading text-lg font-bold"
                      style={{ color: 'var(--primary-700)' }}
                    >
                      NT${total}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
