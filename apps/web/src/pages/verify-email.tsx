import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { routes } from '@/lib/routes';
import { getAuthHeaders } from '@/lib/auth-fetch';
import { extractApiErrorMessage } from '@/lib/utils';
import translations from './verify-email.translations';

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
  const { t } = useLocalTranslation(translations);

  // Handle ?token= — verify via API client (public endpoint)
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || tokenHandled.current) {return;}
    tokenHandled.current = true;
    setTokenVerifying(true);

    verifyByToken(token)
      .then(() => {
        setVerified(true);
        // If we have a session, refresh auth state so redirect works
        if (getAuthHeaders().Authorization) {
          void checkAuth();
        }
      })
      .catch(() => {
        setError(t('invalidLink'));
      })
      .finally(() => setTokenVerifying(false));
  }, [searchParams, verifyByToken, checkAuth]);

  useEffect(() => {
    if (user && !pendingVerification) {
      void navigate(routes.home());
    }
  }, [user, pendingVerification, navigate]);

  useEffect(() => {
    if (cooldown <= 0) {return;}
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyByCode(code);
      void navigate(routes.home());
    } catch (err: unknown) {
      setError(extractApiErrorMessage(err, t('verificationError')));
    } finally {
      setLoading(false);
    }
  }, [code, verifyByCode, navigate]);

  const [resending, setResending] = useState(false);

  const handleResend = useCallback(async () => {
    setError('');
    setResending(true);
    try {
      const res = await resendVerification();
      setCooldown(res.cooldown_seconds);
    } catch (err: unknown) {
      const resData = (err as { response?: { data?: { seconds_remaining?: number } } })?.response?.data;
      if (resData?.seconds_remaining) {
        setCooldown(resData.seconds_remaining);
      }
      setError(extractApiErrorMessage(err, t('resendFailed')));
    } finally {
      setResending(false);
    }
  }, [resendVerification]);

  // Token verification in progress
  if (tokenVerifying) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">{t('verifyingTitle')}</CardTitle>
            <CardDescription>{t('verifyingSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verified successfully
  if (verified) {
    const hasSession = !!getAuthHeaders().Authorization;
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">{t('verifiedTitle')}</CardTitle>
            <CardDescription>{t('verifiedSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate(hasSession ? routes.home() : routes.login())}>
              {hasSession ? t('goToApp') : t('logIn')}
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
          <CardTitle className="text-2xl">{t('confirmTitle')}</CardTitle>
          <CardDescription>
            {t('confirmSubtitle', { email: user?.email ?? '' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="code">{t('codeLabel')}</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('codePlaceholder')}
                maxLength={6}
                autoComplete="one-time-code"
                inputMode="numeric"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? t('verifying') : t('confirm')}
            </Button>
            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={cooldown > 0 || resending}
                onClick={handleResend}
              >
                {resending && <Loader2 className="h-4 w-4 animate-spin" />}
                {cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resend')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
