'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Minus, Trash2, ShoppingBag, CreditCard, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { useLocale } from '@/hooks/use-locale';
import { useQueryClient } from '@tanstack/react-query';
import { useCart, useUpdateCartItem, useRemoveCartItem } from '@/queries/use-cart';
import { useCreateOrder, useLineSend, useConfirmOrder } from '@/queries/use-checkout';

export default function CartPage() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: cart, isLoading } = useCart();
  const updateCartItem = useUpdateCartItem();
  const removeCartItem = useRemoveCartItem();
  const createOrder = useCreateOrder();
  const lineSend = useLineSend();
  const confirmOrder = useConfirmOrder();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal ?? 0;
  const shippingFee = cart?.shipping_fee ?? 0;
  const total = cart?.total ?? 0;

  const handleQuantityChange = (itemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    updateCartItem.mutate({ itemId, quantity: newQuantity });
  };

  const handleRemove = (itemId: number) => {
    removeCartItem.mutate(itemId, {
      onSuccess: () => {
        toast.success(t('cart.remove'));
      },
    });
  };

  const handleCheckout = async (paymentMethod: 'lemon_squeezy' | 'line') => {
    if (!customerName || !customerPhone || !customerAddress) {
      toast.error(t('cart.requiredFields'));
      return;
    }

    setSubmitting(true);
    try {
      const isLine = paymentMethod === 'line';

      const orderData = await createOrder.mutateAsync({
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || undefined,
        customer_address: customerAddress,
        notes: notes || undefined,
        payment_method: paymentMethod,
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

      if (paymentMethod === 'lemon_squeezy' && orderData.checkout_url) {
        window.location.href = orderData.checkout_url;
      } else {
        router.push(`/checkout/success?order=${orderData.order_number}`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

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
              {/* Left Column: Items + Customer Form */}
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
                          className="min-w-[80px] text-right text-sm font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          NT${item.line_total}
                        </span>
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

                {/* Customer Info Form */}
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
                    <div className="space-y-1.5">
                      <Label htmlFor="customer-name">{t('cart.name')} *</Label>
                      <Input
                        id="customer-name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder={t('cart.name')}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="customer-phone">{t('cart.phone')} *</Label>
                      <Input
                        id="customer-phone"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder={t('cart.phone')}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="customer-email">{t('cart.email')}</Label>
                      <Input
                        id="customer-email"
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder={t('cart.email')}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="customer-address">{t('cart.address')} *</Label>
                      <Input
                        id="customer-address"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder={t('cart.address')}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notes">{t('cart.notes')}</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('cart.notes')}
                      rows={3}
                    />
                  </div>
                </div>

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

                  {/* Checkout Buttons */}
                  <div className="space-y-3 pt-2">
                    <Button
                      className="w-full gap-2 rounded-full"
                      size="lg"
                      style={{ background: 'var(--checkout-gradient)', color: '#fff' }}
                      onClick={() => handleCheckout('lemon_squeezy')}
                      disabled={submitting}
                    >
                      <CreditCard className="h-4 w-4" />
                      {t('cart.creditCard')}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2 rounded-full"
                      size="lg"
                      style={{ borderColor: '#06C755', color: '#06C755' }}
                      onClick={() => handleCheckout('line')}
                      disabled={submitting}
                    >
                      <MessageCircle className="h-4 w-4" />
                      {t('cart.linePay')}
                    </Button>
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
