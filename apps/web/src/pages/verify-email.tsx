import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function VerifyEmailPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [searchParams] = useSearchParams();

  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const user = useAuthStore((s) => s.user);
  const pendingVerification = useAuthStore((s) => s.pendingVerification);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      checkAuth().then(() => navigate('/'));
    }
    if (searchParams.get('error') === 'invalid') {
      setError('The verification link is invalid or has expired. Please request a new code.');
    }
  }, [searchParams, checkAuth, navigate]);

  useEffect(() => {
    if (user && !pendingVerification) {
      navigate('/');
    }
  }, [user, pendingVerification, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyEmail(code);
      navigate('/');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Verification failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [code, verifyEmail, navigate]);

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
      const msg = err?.response?.data?.message || err?.message || 'Failed to resend code';
      setError(msg);
    }
  }, [resendVerification]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Verify your email</CardTitle>
          <CardDescription>
            We sent a 6-digit code to <strong>{user?.email}</strong>. Enter it below to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
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
              {loading ? 'Verifying...' : 'Verify'}
            </Button>
            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={cooldown > 0}
                onClick={handleResend}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
