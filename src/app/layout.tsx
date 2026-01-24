import '@/wdyr';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { auth } from '@/auth';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/sidebar/Sidebar';
import AuthProvider from '@/components/auth/AuthProvider';
import Providers from '@/components/Providers';
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
            {/* Передаємо юзера в Навбар через пропси */}
            <Navbar user={session?.user} />

            <div className="flex pt-16 min-h-screen">
              {session && <Sidebar />}
              <main className="flex-1">{children}</main>
            </div>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
