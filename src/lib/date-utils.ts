import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { uk } from 'date-fns/locale';

/**
 * Для повідомлень у чаті: 
 * Якщо сьогодні — "14:20"
 * Якщо вчора — "Вчора, 14:20"
 * Якщо раніше — "24 січ., 14:20"
 */
export function formatMessageDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isToday(d)) {
    return format(d, 'HH:mm');
  }
  if (isYesterday(d)) {
    return `Вчора, ${format(d, 'HH:mm')}`;
  }
  return format(d, 'd MMM, HH:mm', { locale: uk });
}

/**
 * Для списку чатів: "2 хв. тому", "5 днів тому"
 */
export function formatRelativeTime(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: uk });
}
