import { Globe, UserCheck, Zap, LogOut, UserPen, Smartphone } from 'lucide-react';

export function EventTypeIcon({ eventName }: { eventName: string }) {
  if (eventName === '$pageview') return <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
  if (eventName === '$pageleave') return <LogOut className="h-3.5 w-3.5 text-orange-400 shrink-0" />;
  if (eventName === '$identify') return <UserCheck className="h-3.5 w-3.5 text-violet-400 shrink-0" />;
  if (eventName === '$set' || eventName === '$set_once') return <UserPen className="h-3.5 w-3.5 text-green-400 shrink-0" />;
  if (eventName === '$screen') return <Smartphone className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
  return <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
}
