import { createBrowserClient } from '@supabase/ssr';
import { camelizeKeys, decamelizeKeys } from 'humps';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: async (url, options) => {
        // 1. OUTBOUND: Перетворюємо camelCase з JS у snake_case для бази
        // Перевіряємо, чи це JSON, щоб не пошкодити FormData (файли)
        if (options?.body && typeof options.body === 'string') {
          try {
            const body = JSON.parse(options.body);
            options.body = JSON.stringify(decamelizeKeys(body));
          } catch {
            /* Залишаємо як є, якщо не JSON */
          }
        }

        const response = await fetch(url, options);

        // 2. INBOUND: Перетворюємо snake_case з бази у camelCase для фронта
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const json = await response.json();
          // Повертаємо новий об'єкт відповіді з модифікованим JSON
          return new Response(JSON.stringify(camelizeKeys(json)), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }

        return response;
      },
    },
  });
}
