'use server';

import { and, eq, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { chats, users } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';

/**
 * Отримує поточного користувача із Supabase SSR та синхронізує його з нашою БД Drizzle.
 */
async function getCurrentUser() {
  try {
    const supabase = await createClient();

    // 1. Спочатку отримуємо сесію (getSession надійніша для початкової перевірки в SSR)
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      console.log('No active session found');
      return null;
    }

    // 2. Для безпеки отримуємо свіжі дані користувача
    const user = session.user;

    // Безпечне отримання метаданих (додав додаткові перевірки)
    const userName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Користувач';

    const userImage = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

    // 3. Синхронізація з Drizzle
    const [dbUser] = await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email ?? '',
        name: userName,
        image: userImage,
        lastSeen: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: userName,
          image: userImage,
          lastSeen: new Date(),
        },
      })
      .returning();

    return dbUser;
  } catch (err) {
    // Якщо прилетить той самий TypeError про "string", ми його зловимо тут
    // і не дамо всьому серверу "впасти"
    console.error('Critical error in getCurrentUser:', err);
    return null;
  }
}

export async function getOrCreateChatAction(targetUserId: string) {
  const user = await getCurrentUser();
  if (!user?.id) throw new Error('Unauthorized');

  const myId = user.id;
  let targetChatId: string | null = null;

  try {
    const existingChat = await db.query.chats.findFirst({
      where: or(
        and(eq(chats.userId, myId), eq(chats.recipientId, targetUserId)),
        and(eq(chats.userId, targetUserId), eq(chats.recipientId, myId)),
      ),
    });

    if (existingChat) {
      targetChatId = existingChat.id;
    } else {
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
      });

      const [newChat] = await db
        .insert(chats)
        .values({
          userId: myId,
          recipientId: targetUserId,
          title: targetUser?.name || 'Приватний чат',
        })
        .returning();

      targetChatId = newChat.id;
    }
  } catch (error) {
    console.error('Error in getOrCreateChatAction:', error);
    // Ми не редиректимо при помилці, щоб не висіла загрузка без причини
    throw new Error('Failed to create or find chat');
  }

  // Редирект має бути в самому кінці, поза try/catch
  if (targetChatId) {
    revalidatePath('/chat');
    redirect(`/chat/${targetChatId}`);
  }
}

// All other actions have been removed as part of the Client-First Supabase Architecture refactor.
