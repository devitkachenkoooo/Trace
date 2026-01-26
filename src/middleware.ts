import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { LRUCache } from 'lru-cache';

// In-memory rate limiter: 10 запитів на 10 секунд
const rateLimit = new LRUCache<string, number>({
  max: 1000, // Збільшимо до 1000 юзерів
  ttl: 10000, // 10 секунд
  // Важливо: не скидати TTL при кожному зверненні, щоб ліміт був чесним
  noDisposeOnSet: true, 
});

export default auth((req) => {
  const { pathname } = req.nextUrl;
  
  // 1. DDoS ЗАХИСТ (API)
  if (pathname.startsWith('/api')) {
    // Отримуємо IP (враховуємо проксі Vercel)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.ip || '127.0.0.1';
    
    const count = rateLimit.get(ip) || 0;

    if (count >= 10) {
      return NextResponse.json(
        { error: 'Too many requests. Slow down!' },
        { status: 429 }
      );
    }

    // Збільшуємо лічильник, зберігаючи час життя (TTL)
    rateLimit.set(ip, count + 1, { ttl: rateLimit.getRemainingTTL?.(ip) || 10000 });
  }

  // 2. АВТОРИЗАЦІЯ (CHAT)
  const isLoggedIn = !!req.auth;
  if (pathname.startsWith('/chat') && !isLoggedIn) {
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/chat/:path*', '/api/:path*'],
};