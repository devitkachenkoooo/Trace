'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, useEffect, useRef } from 'react';
import { toast, Toaster } from 'sonner';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';

/**
 * Внутрішній компонент-запобіжник.
 * Він відстежує кількість рендерів у всьому додатку.
 */
function RenderGuard({ children }: { children: React.ReactNode }) {
  const renderCount = useRef(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current += 1;
    const now = Date.now();

    // Скидаємо лічильник кожні 5 секунд
    if (now - startTime.current > 5000) {
      renderCount.current = 1;
      startTime.current = now;
      return;
    }

    // Якщо рендерів занадто багато (більше 30 за 5 сек) — це "петля"
    if (renderCount.current > 30) {
      console.error("⛔ [RenderGuard] Detected an infinite loop.");
      
      toast.error("Критична помилка клієнта", {
        description: "Виявлено вічний цикл. Повертаємось на головну...",
        duration: 5000,
      });

      // Робимо жорсткий редірект, щоб розірвати цикл
      setTimeout(() => {
        window.location.replace('/'); 
      }, 1500);
    }
  }); // Масив залежностей порожній (відсутній), щоб спрацьовувати на кожен рендер

  return <>{children}</>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  // Ініціалізуємо QueryClient один раз через useState
  const [queryClient] = useState(() => {
    return new QueryClient({
      mutationCache: new MutationCache({
        onError: (error: any) => {
          // If the error has a 'status' property, it was likely handled by the Supabase fetch interceptor
          // We only want to toast for client-side errors or unexpected issues here.
          if (!error?.status) {
            toast.error('Error', {
              description: error.message || 'An unexpected error occurred.',
            });
          }
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          // Захист від зайвих запитів при помилці авторизації
          retry: (failureCount, error: any) => {
            if (error?.status === 401) return false;
            return failureCount < 3;
          },
        },
      },
    });
  });

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalErrorBoundary>
        <RenderGuard>
          {children}
        </RenderGuard>
        <Toaster 
          position="top-right" 
          richColors 
          closeButton 
          expand={true}
          visibleToasts={3}
          toastOptions={{
            style: { zIndex: 9999 }
          }}
        />
      </GlobalErrorBoundary>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}