import { camelizeKeys } from 'humps';

/**
 * Standardizes Realtime payloads to match the format of fetch results.
 * Handles camelCase conversion and any necessary data mapping.
 */
export function normalizePayload<T>(payload: any): T {
  if (!payload) return payload;
  
  // 1. Camelize keys (snake_case from DB -> camelCase for UI)
  const camelized = camelizeKeys(payload);
  
  // 2. Add any custom mappings if needed (e.g. converting string IDs to numbers if necessary, 
  // but here we mostly use strings).
  // We can also ensure dates are handled consistently here if needed.
  
  return camelized as T;
}
