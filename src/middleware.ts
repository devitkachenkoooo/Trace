import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { LRUCache } from 'lru-cache';

// Налаштування лімітів: 10 запитів на 10 секунд
const rateLimit = new LRUCache<string, number>({
  max: 1000,
  ttl: 10000,
});

export default auth((req) => {
  const { pathname } = req.nextUrl;
  
  // Визначаємо IP-адресу через заголовки (стандарт для Vercel)
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : '127.0.0.1';

  // 1. Захист API (DDoS Rate Limiting)
  if (pathname.startsWith('/api')) {
    const count = rateLimit.get(ip) || 0;

    if (count >= 10) {
      return NextResponse.json(
        { error: 'Too many requests. Slow down!' },
        { status: 429 }
      );
    }

    rateLimit.set(ip, count + 1);
  }

  // 2. Захист сторінок чату (Авторизація)
  const isLoggedIn = !!req.auth;
  const isOnChatPage = pathname.startsWith('/chat');

  if (isOnChatPage && !isLoggedIn) {
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Матчер, який покриває все, крім статичних файлів
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};