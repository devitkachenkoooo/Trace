import { format, isToday, isYesterday } from 'date-fns';
import { uk } from 'date-fns/locale';

/**
 * Для повідомлень у самому чаті (HH:mm або дата)
 */
export function formatMessageDate(date: any) {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return `Вчора, ${format(d, 'HH:mm')}`;
    
    return format(d, 'd MMM, HH:mm', { locale: uk });
  } catch (err) {
    return '';
  }
}

/**
 * Для списку чатів у сайдбарі (відносний час)
 */
export function formatRelativeTime(date: any) {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Вчора';
    
    // Якщо старіше за вчора — просто дата
    return format(d, 'dd.MM.yy');
  } catch (err) {
    return '';
  }
}