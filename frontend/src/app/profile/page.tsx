'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';

const API_URL = '';

export default function ProfilePage() {
  const { t } = useLocale();
  const { user, token, isLoading: authLoading, refreshUser } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/user/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ name, phone }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Save failed');
      }

      await refreshUser();
      toast.success(t('profile.saved'));
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
        <Header />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-12">
          <Skeleton className="mb-6 h-8 w-40" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
      <Header />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12">
        <h1
          className="font-heading mb-8 text-2xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('profile.title')}
        </h1>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">{t('auth.email')}</Label>
            <Input id="profile-email" value={user.email} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">{t('auth.name')}</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.name')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone">{t('cart.phone')}</Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('cart.phone')}
            />
          </div>
          <Button
            type="submit"
            className="rounded-full px-8"
            style={{ backgroundColor: 'var(--primary-500)', color: '#fff' }}
            disabled={saving}
          >
            {saving ? '...' : t('profile.save')}
          </Button>
        </form>

        <Separator className="my-8" />

        <Link href="/orders">
          <Button variant="outline" className="w-full gap-2">
            <ClipboardList className="h-4 w-4" />
            {t('nav.orders')}
          </Button>
        </Link>
      </main>
      <Footer />
    </div>
  );
}
