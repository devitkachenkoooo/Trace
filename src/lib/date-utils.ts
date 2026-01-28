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
 * відносний час
 */
export function formatRelativeTime(date: any) {
  if (!date) return '';
  try {
    // Якщо дата приходить як рядок і не містить інфо про пояс, додаємо 'Z' (UTC)
    const dateString = typeof date === 'string' && !date.includes('Z') && !date.includes('+') 
      ? `${date.replace(' ', 'T')}Z` 
      : date;

    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';

    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Вчора';
    
    return format(d, 'dd.MM.yy');
  } catch (err) {
    return '';
  }
}