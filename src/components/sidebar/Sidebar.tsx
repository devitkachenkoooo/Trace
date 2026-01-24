import { desc, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/db';
import { chats } from '@/db/schema';
import SidebarShell from './SidebarShell';

export interface Chat {
  id: string;
  title: string;
  createdAt: Date;
  userId: string;
  recipientId?: string | null;
}

export interface SidebarUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export default async function Sidebar() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId || !session?.user) return null;

  // Виконуємо запит один раз на сервері
  const initialChats = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: [desc(chats.createdAt)],
  });

  return (
    <SidebarShell 
      initialChats={initialChats as Chat[]} 
    />
  );
}
