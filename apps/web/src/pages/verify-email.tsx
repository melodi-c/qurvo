import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { routes } from '@/lib/routes';

export default function VerifyEmailPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenVerifying, setTokenVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [searchParams] = useSearchParams();
  const tokenHandled = useRef(false);

  const verifyByCode = useAuthStore((s) => s.verifyByCode);
  const verifyByToken = useAuthStore((s) => s.verifyByToken);
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const user = useAuthStore((s) => s.user);
  const pendingVerification = useAuthStore((s) => s.pendingVerification);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const navigate = useNavigate();

  // Handle ?token= — verify via API client (public endpoint)
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || tokenHandled.current) return;
    tokenHandled.current = true;
    setTokenVerifying(true);

    verifyByToken(token)
      .then(() => {
        setVerified(true);
        // If we have a session, refresh auth state so redirect works
        if (localStorage.getItem('qurvo_token')) {
          checkAuth();
        }
      })
      .catch(() => {
        setError('Ссылка недействительна или устарела. Запросите новый код.');
      })
      .finally(() => setTokenVerifying(false));
  }, [searchParams, verifyByToken, checkAuth]);

  useEffect(() => {
    if (user && !pendingVerification) {
      navigate(routes.home());
    }
  }, [user, pendingVerification, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyByCode(code);
      navigate(routes.home());
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Ошибка верификации';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [code, verifyByCode, navigate]);

  const handleResend = useCallback(async () => {
    setError('');
    try {
      const res = await resendVerification();
      setCooldown(res.cooldown_seconds);
    } catch (err: any) {
      const secondsRemaining = err?.response?.data?.seconds_remaining;
      if (secondsRemaining) {
        setCooldown(secondsRemaining);
      }
      const msg = err?.response?.data?.message || err?.message || 'Не удалось отправить код';
      setError(msg);
    }
  }, [resendVerification]);

  // Token verification in progress
  if (tokenVerifying) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Подтверждаем email...</CardTitle>
            <CardDescription>Подождите, проверяем вашу ссылку.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Verified successfully
  if (verified) {
    const hasSession = !!localStorage.getItem('qurvo_token');
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Email подтверждён</CardTitle>
            <CardDescription>Ваш аккаунт успешно подтверждён.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate(hasSession ? routes.home() : routes.login())}>
              {hasSession ? 'Перейти в приложение' : 'Войти'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Подтвердите email</CardTitle>
          <CardDescription>
            Мы отправили 6-значный код на <strong>{user?.email}</strong>. Введите его ниже.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="code">Код подтверждения</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                autoComplete="one-time-code"
                inputMode="numeric"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
              {loading ? 'Проверяем...' : 'Подтвердить'}
            </Button>
            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={cooldown > 0}
                onClick={handleResend}
              >
                {cooldown > 0 ? `Отправить повторно через ${cooldown}с` : 'Отправить код повторно'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
