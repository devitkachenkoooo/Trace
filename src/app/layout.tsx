import '@/wdyr';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { auth } from '@/auth';
import AuthProvider from '@/components/auth/AuthProvider';
import ChatLayoutWrapper from '@/components/layout/ChatLayoutWrapper';
import Providers from '@/components/Providers';
import RealtimePresence from '@/components/realtime/RealtimePresence';
import Sidebar from '@/components/sidebar/Sidebar';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Trace',
  description: 'A modern messaging app',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Отримуємо сесію на рівні сервера
  const session = await auth();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white`}
      >
        <Providers>
          <AuthProvider>
            <RealtimePresence />
            <ChatLayoutWrapper 
              user={session?.user} 
              sidebar={session ? <Sidebar /> : null}
            >
              {children}
            </ChatLayoutWrapper>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
