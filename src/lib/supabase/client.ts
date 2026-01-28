import { createBrowserClient } from '@supabase/ssr';
import { camelizeKeys, decamelizeKeys } from 'humps';

let client: any;

export function createClient() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: async (url, options) => {
        // 1. OUTBOUND: Convert camelCase from JS to snake_case for DB
        if (options?.body && typeof options.body === 'string') {
          try {
            const body = JSON.parse(options.body);
            options.body = JSON.stringify(decamelizeKeys(body));
          } catch {
            /* Keep as is if not JSON */
          }
        }

        const response = await fetch(url, options);

        // 2. INBOUND: Convert snake_case from DB to camelCase for frontend
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const json = await response.json();
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

  return client;
}

// Export a constant instance for use in hooks to reinforce singleton usage
export const supabase = createClient();
