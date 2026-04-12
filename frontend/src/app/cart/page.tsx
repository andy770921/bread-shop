'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { z } from 'zod';
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
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';
import { useQueryClient } from '@tanstack/react-query';
import { useCart, useUpdateCartItem, useRemoveCartItem } from '@/queries/use-cart';
import { useCreateOrder, useLineSend, useConfirmOrder } from '@/queries/use-checkout';

const paymentMethods = ['credit_card', 'line_transfer'] as const;

const cartFormSchema = z
  .object({
    customerName: z.string().min(1, 'required'),
    customerPhone: z.string().min(1, 'required'),
    customerEmail: z.string().email().or(z.literal('')).optional(),
    customerAddress: z.string().min(1, 'required'),
    notes: z.string().optional(),
    paymentMethod: z.enum(paymentMethods, { required_error: 'required' }),
    cardNumber: z.string().optional(),
    cardExpiry: z.string().optional(),
    cardCvv: z.string().optional(),
    cardholderName: z.string().optional(),
    lineId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const addRequired = (path: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: 'required' });
    if (data.paymentMethod === 'credit_card') {
      if (!data.cardNumber) addRequired('cardNumber');
      if (!data.cardExpiry) addRequired('cardExpiry');
      if (!data.cardCvv) addRequired('cardCvv');
      if (!data.cardholderName) addRequired('cardholderName');
    }
    // lineId validation is handled outside zod — conditional on auth state (line_user_id)
  });

type CartFormValues = z.infer<typeof cartFormSchema>;

export default function CartPage() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: cart, isLoading } = useCart();
  const { updateItem } = useUpdateCartItem();
  const removeCartItem = useRemoveCartItem();
  const createOrder = useCreateOrder();
  const lineSend = useLineSend();
  const confirmOrder = useConfirmOrder();

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
      cardNumber: '',
      cardExpiry: '',
      cardCvv: '',
      cardholderName: '',
      lineId: '',
    },
  });

  const selectedPayment = form.watch('paymentMethod');

  // Restore form data after LINE Login redirect
  useEffect(() => {
    const saved = localStorage.getItem('cart_form_data');
    if (saved) {
      localStorage.removeItem('cart_form_data');
      try {
        form.reset(JSON.parse(saved));
      } catch {
        // ignore malformed JSON
      }
    }
  }, [form]);

  // Reset conditional fields when payment method changes
  useEffect(() => {
    if (selectedPayment === 'credit_card') {
      form.setValue('lineId', '');
      form.clearErrors('lineId');
    } else if (selectedPayment === 'line_transfer') {
      form.setValue('cardNumber', '');
      form.setValue('cardExpiry', '');
      form.setValue('cardCvv', '');
      form.setValue('cardholderName', '');
      form.clearErrors(['cardNumber', 'cardExpiry', 'cardCvv', 'cardholderName']);
    }
  }, [selectedPayment, form]);

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal ?? 0;
  const shippingFee = cart?.shipping_fee ?? 0;
  const total = cart?.total ?? 0;

  const handleQuantityChange = (itemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    updateItem(itemId, newQuantity);
  };

  const handleRemove = (itemId: number) => {
    removeCartItem.mutate(itemId, {
      onSuccess: () => {
        toast.success(t('cart.remove'));
      },
    });
  };

  const onSubmit = async (values: CartFormValues) => {
    const isLine = values.paymentMethod === 'line_transfer';
    const apiPaymentMethod = isLine ? 'line' : 'lemon_squeezy';

    // LINE transfer requires LINE Login to get internal userId for messaging
    if (isLine && !hasLineUserId) {
      localStorage.setItem('cart_form_data', JSON.stringify(values));
      localStorage.setItem('line_login_return_url', '/cart');
      window.location.href = '/api/auth/line';
      return;
    }

    try {
      const orderData = await createOrder.mutateAsync({
        customer_name: values.customerName,
        customer_phone: values.customerPhone,
        customer_email: values.customerEmail || undefined,
        customer_address: values.customerAddress,
        notes: values.notes || undefined,
        payment_method: apiPaymentMethod,
        customer_line_id: isLine ? values.lineId : undefined,
        skip_cart_clear: isLine,
      });

      if (isLine) {
        const lineData = await lineSend.mutateAsync(orderData.id);

        if (!lineData?.success) {
          if (lineData?.needs_friend && lineData?.add_friend_url) {
            toast.error(t('cart.lineAddFriend'));
            window.open(lineData.add_friend_url, '_blank');
          } else {
            toast.error(t('cart.lineSendFailed'));
          }
          return;
        }

        await confirmOrder.mutateAsync(orderData.id);
        queryClient.invalidateQueries({ queryKey: ['cart'] });
        router.push(`/checkout/success?order=${orderData.order_number}`);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['cart'] });

      if (apiPaymentMethod === 'lemon_squeezy' && orderData.checkout_url) {
        window.location.href = orderData.checkout_url;
      } else {
        router.push(`/checkout/success?order=${orderData.order_number}`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Checkout failed');
    }
  };

  const submitting = form.formState.isSubmitting;
  const hasLineUserId = !!user?.line_user_id;

  // Empty state
  if (!isLoading && items.length === 0) {
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

          {isLoading ? (
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
                    const name = locale === 'zh' ? item.product.name_zh : item.product.name_en;
                    const imageUrl = item.product.image_url || '/placeholder-product.jpg';

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
                          <Image
                            src={imageUrl}
                            alt={name}
                            fill
                            sizes="80px"
                            className="object-cover"
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
                              disabled={item.quantity <= 1}
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

                      {/* Credit Card Fields */}
                      {selectedPayment === 'credit_card' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="cardNumber"
                            render={({ field }) => (
                              <FormItem className="sm:col-span-2">
                                <FormLabel>{t('cart.cardNumber')} *</FormLabel>
                                <FormControl>
                                  <Input placeholder={t('cart.cardNumberPlaceholder')} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="cardExpiry"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('cart.cardExpiry')} *</FormLabel>
                                <FormControl>
                                  <Input placeholder={t('cart.cardExpiryPlaceholder')} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="cardCvv"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('cart.cardCvv')} *</FormLabel>
                                <FormControl>
                                  <Input placeholder={t('cart.cardCvvPlaceholder')} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="cardholderName"
                            render={({ field }) => (
                              <FormItem className="sm:col-span-2">
                                <FormLabel>{t('cart.cardholderName')} *</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder={t('cart.cardholderNamePlaceholder')}
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
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

                          {/* LINE ID field — optional when linked, for admin reference */}
                          <FormField
                            control={form.control}
                            name="lineId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  {hasLineUserId ? t('cart.lineIdOptional') : t('cart.lineId')}
                                </FormLabel>
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
                      {selectedPayment === 'credit_card' && (
                        <Button
                          type="submit"
                          className="w-full gap-2 rounded-full"
                          size="lg"
                          style={{ background: 'var(--checkout-gradient)', color: '#fff' }}
                          disabled={!form.formState.isValid || submitting}
                        >
                          <CreditCard className="h-4 w-4" />
                          {t('cart.creditCard')}
                        </Button>
                      )}
                      {selectedPayment === 'line_transfer' && (
                        <>
                          <Button
                            type="submit"
                            variant="outline"
                            className="w-full gap-2 rounded-full"
                            size="lg"
                            style={{ borderColor: '#06C755', color: '#06C755' }}
                            disabled={!form.formState.isValid || submitting}
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
                <Link href="/">
                  <Button variant="ghost" size="sm">
                    &larr; {t('cart.continueShopping')}
                  </Button>
                </Link>
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
                      const name = locale === 'zh' ? item.product.name_zh : item.product.name_en;
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
