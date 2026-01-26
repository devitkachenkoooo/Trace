import '@/wdyr';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white`}
      >
        <Providers>
          <AuthProvider>
            <RealtimePresence />
            <ChatLayoutWrapper 
              user={user ? { 
                id: user.id, 
                email: user.email, 
                name: user.user_metadata.full_name || user.user_metadata.name || user.email?.split('@')[0],
                image: user.user_metadata.avatar_url || user.user_metadata.picture
              } : null} 
              sidebar={user ? <Sidebar /> : null}
            >
              {children}
            </ChatLayoutWrapper>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
