import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiResponseError } from '@repo/shared';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { useLocale } from '@/hooks/use-locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { user, login } = useAdminAuth();
  const navigate = useNavigate();
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  async function onSubmit(values: LoginValues) {
    setError(null);
    try {
      await login(values.email, values.password);
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 403) {
        setError(t('login.noAccess'));
      } else {
        setError(t('login.invalid'));
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-body px-4">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="font-serif text-2xl text-primary-700">{t('app.title')}</CardTitle>
          <CardDescription>{t('login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="email">{t('login.email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email && <p className="text-sm text-error">{t('common.required')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('login.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <p className="text-sm text-error">{t('common.required')}</p>}
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
