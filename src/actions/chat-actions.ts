'use server';

import { and, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/db';
import { chats, messages, users } from '@/db/schema';

import type { FullChat, Message, User } from '@/types';

export async function getFullChatAction(chatId: string): Promise<{ success: true; data: FullChat } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (!chat) return { success: false, error: 'Chat not found' };

    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, chatId),
      orderBy: [desc(messages.createdAt)],
    });

    const otherUserId = chat.userId === session.user.id ? chat.recipientId : chat.userId;
    if (!otherUserId) return { success: true, data: { ...chat, messages: chatMessages, participants: [] } };

    const otherUser = await db.query.users.findFirst({
      where: eq(users.id, otherUserId),
    });

    return {
      success: true,
      data: {
        ...chat,
        messages: chatMessages,
        participants: otherUser ? [otherUser] : [],
      },
    };
  } catch (error) {
    console.error('Error fetching full chat:', error);
    return { success: false, error: 'Failed to fetch chat details' };
  }
}

export async function searchUsersAction(query: string): Promise<{ success: true; data: User[] } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  const myId = session.user.id;

  try {
    if (!query) {
      // Find all chats where I am a participant
      const myChats = await db.query.chats.findMany({
        where: or(eq(chats.userId, myId), eq(chats.recipientId, myId)),
        with: {
          // This assumes you have relations defined in drizzle
          // If not, we'll need to fetch the user IDs and then the users
        },
      });

      // Get unique IDs of people I've chatted with
      const participantIds = myChats.map((c) => (c.userId === myId ? c.recipientId : c.userId)).filter(Boolean) as string[];

      if (participantIds.length === 0) {
        return { success: true, data: [] };
      }

      const results = await db.query.users.findMany({
        where: and(ne(users.id, myId), or(...participantIds.map((id) => eq(users.id, id)))),
      });

      return { success: true, data: results };
    }

    const results = await db.query.users.findMany({
      where: and(ne(users.id, myId), or(ilike(users.name, `%${query}%`), ilike(users.email, `%${query}%`))),
      limit: 20,
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

export async function sendMessageAction(chatId: string, content: string): Promise<{ success: true; data: Message } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    const [newMessage] = await db
      .insert(messages)
      .values({
        chatId,
        senderId: session.user.id,
        content: content.trim(),
      })
      .returning();

    return { success: true, data: newMessage as unknown as Message };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}

export async function markAsReadAction(chatId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(and(eq(messages.chatId, chatId), ne(messages.senderId, session.user.id), eq(messages.isRead, false)));

    return { success: true };
  } catch (error) {
    console.error('Error marking as read:', error);
    return { success: false, error: 'Failed to mark messages as read' };
  }
}

export async function getChatsAction(): Promise<{ success: true; data: FullChat[] } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  const myId = session.user.id;

  try {
    const myChats = await db.query.chats.findMany({
      where: or(eq(chats.userId, myId), eq(chats.recipientId, myId)),
      orderBy: [desc(chats.createdAt)],
    });

    const fullChats = await Promise.all(
      myChats.map(async (chat) => {
        const chatMessages = await db.query.messages.findMany({
          where: eq(messages.chatId, chat.id),
          orderBy: [desc(messages.createdAt)],
          limit: 1,
        });

        const otherUserId = chat.userId === myId ? chat.recipientId : chat.userId;
        const otherUser = otherUserId
          ? await db.query.users.findFirst({
              where: eq(users.id, otherUserId),
            })
          : null;

        return {
          ...chat,
          messages: chatMessages as unknown as Message[],
          participants: otherUser ? [otherUser as unknown as User] : [],
        };
      })
    );

    return { success: true, data: fullChats as unknown as FullChat[] };
  } catch (error) {
    console.error('Error fetching chats:', error);
    return { success: false, error: 'Failed to fetch chats' };
  }
}

export async function updateLastSeenAction(): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    await db
      .update(users)
      .set({ lastSeen: new Date() })
      .where(eq(users.id, session.user.id));

    return { success: true };
  } catch (error) {
    console.error('Error updating last seen:', error);
    return { success: false, error: 'Failed to update last seen' };
  }
}
