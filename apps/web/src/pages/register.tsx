import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { routes } from '@/lib/routes';
import translations from './register.translations';

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', display_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const { t } = useLocalTranslation(translations);

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate(routes.home());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('registrationFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="name">{t('name')}</Label>
              <Input id="name" value={form.display_name} onChange={update('display_name')} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input id="email" type="email" value={form.email} onChange={update('email')} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input id="password" type="password" value={form.password} onChange={update('password')} required minLength={8} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('creating') : t('createAccount')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('hasAccount')}{' '}
              <Link to={routes.login()} className="text-primary underline">
                {t('signIn')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
