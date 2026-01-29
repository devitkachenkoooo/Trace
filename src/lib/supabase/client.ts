'use client';

import { createBrowserClient } from '@supabase/ssr';
import { camelizeKeys, decamelizeKeys } from 'humps';
import { toast } from 'sonner';

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

        // --- GLOBAL ERROR HANDLING ---
        if (!response.ok) {
          // Silent handling for 401 Unauthorized (Auth listener handles redirects)
          if (response.status === 401) {
            return response;
          }

          // Robust error parsing
          let errorMessage = response.statusText;
          try {
            const text = await response.clone().text();
            if (text) {
              const errorBody = JSON.parse(text);
              errorMessage = 
                errorBody?.message || 
                errorBody?.error_description || 
                errorBody?.msg || 
                errorMessage;
            }
          } catch {
            // If body parsing fails, stick to statusText or default
          }

          // Trigger Toast for non-401 errors
          if (response.status >= 500) {
            toast.error(`Server Error (${response.status})`, {
              description: 'Something went wrong on our end. Please try again later.',
            });
          } else if (response.status >= 400) {
            toast.error('Request Failed', {
              description: errorMessage || 'Unable to complete this action.',
            });
          }

          return response;
        }

        // --- SUCCESSFUL RESPONSE HANDLING ---
        // If status between 200-299, return immediately if no body or not JSON
        if (response.status === 204 || response.status === 205) {
          return response;
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          try {
            const text = await response.clone().text();
            if (!text) return response;
            
            const json = JSON.parse(text);
            return new Response(JSON.stringify(camelizeKeys(json)), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          } catch (err) {
            console.error('[Supabase Interceptor] Failed to parse success JSON:', err);
            return response;
          }
        }

        return response;
      },
    },
  });

  return client;
}

// Export a constant instance for use in hooks to reinforce singleton usage
export const supabase = createClient();
