import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnChatPage = req.nextUrl.pathname.startsWith('/chat');

  if (isOnChatPage && !isLoggedIn) {
    // Використовуємо NextResponse для стабільності в Next.js
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }
  
  return NextResponse.next();
});

export const config = {
  // Твій матчер правильний, він фокусується тільки на чаті
  matcher: ['/chat/:path*'],
};