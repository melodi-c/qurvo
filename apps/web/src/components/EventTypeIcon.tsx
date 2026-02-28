import { Globe, UserCheck, Zap, LogOut, UserPen, Smartphone } from 'lucide-react';
import { EVENT_TYPE_COLORS } from '@/lib/chart-colors';

export function EventTypeIcon({ eventName }: { eventName: string }) {
  if (eventName === '$pageview') {return <Globe className={`h-3.5 w-3.5 ${EVENT_TYPE_COLORS.pageview} shrink-0`} />;}
  if (eventName === '$pageleave') {return <LogOut className={`h-3.5 w-3.5 ${EVENT_TYPE_COLORS.pageleave} shrink-0`} />;}
  if (eventName === '$identify') {return <UserCheck className={`h-3.5 w-3.5 ${EVENT_TYPE_COLORS.identify} shrink-0`} />;}
  if (eventName === '$set' || eventName === '$set_once') {return <UserPen className={`h-3.5 w-3.5 ${EVENT_TYPE_COLORS.set} shrink-0`} />;}
  if (eventName === '$screen') {return <Smartphone className={`h-3.5 w-3.5 ${EVENT_TYPE_COLORS.screen} shrink-0`} />;}
  return <Zap className={`h-3.5 w-3.5 ${EVENT_TYPE_COLORS.custom} shrink-0`} />;
}
