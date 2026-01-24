'use server';

import { and, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/db';
import { chats, users } from '@/db/schema';

export async function getChatsAction(userId: string) {
  try {
    const results = await db.query.chats.findMany({
      where: eq(chats.userId, userId),
      orderBy: [desc(chats.createdAt)],
    });
    return { success: true, data: results };
  } catch (error) {
    console.error('Error fetching chats:', error);
    return { success: false, error: 'Failed to fetch chats' };
  }
}

export async function searchUsersAction(query: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    const results = await db.query.users.findMany({
      where: and(
        ne(users.id, session.user.id),
        query ? or(ilike(users.name, `%${query}%`), ilike(users.email, `%${query}%`)) : undefined,
      ),
      limit: 10,
    });
    return { success: true, data: results };
  } catch (error) {
    console.error('Error searching users:', error);
    return { success: false, error: 'Failed to search users' };
  }
}

export async function getOrCreateChatAction(targetUserId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const myId = session.user.id;

  // Шукаємо існуючий чат 1-на-1
  const existingChat = await db.query.chats.findFirst({
    where: or(
      and(eq(chats.userId, myId), eq(chats.recipientId, targetUserId)),
      and(eq(chats.userId, targetUserId), eq(chats.recipientId, myId)),
    ),
  });

  if (existingChat) {
    redirect(`/chat/${existingChat.id}`);
  }

  // Отримуємо ім'я отримувача для заголовка чату (опційно)
  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
  });

  // Створюємо новий чат
  const [newChat] = await db
    .insert(chats)
    .values({
      userId: myId,
      recipientId: targetUserId,
      title: targetUser?.name || 'Приватний чат',
    })
    .returning();

  revalidatePath('/');
  redirect(`/chat/${newChat.id}`);
}
