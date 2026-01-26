'use server';

import { and, desc, eq, ilike, lt, ne, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/db';
import { chats, messages, users } from '@/db/schema';
import { supabaseService } from '@/lib/supabase';

import type { Attachment, FullChat, Message, User } from '@/types';

// Оптимізований getFullChatAction
export async function getFullChatAction(chatId: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        recipient: true,
        user: true,
        messages: {
          orderBy: [desc(messages.createdAt)],
          limit: 50,
          with: {
            replyTo: {
              with: { sender: true }
            }
          }
        },
      },
    });

    if (!chat) return { success: false, error: 'Chat not found' };

    const otherUser = chat.userId === session.user.id ? chat.recipient : chat.user;
    
    // Форматуємо replyDetails прямо тут
    const messagesWithReplies = chat.messages.reverse().map(msg => ({
      ...msg,
      replyDetails: msg.replyTo ? {
        id: msg.replyTo.id,
        content: msg.replyTo.content,
        sender: { name: msg.replyTo.sender?.name || 'Unknown' }
      } : null
    }));

    return {
      success: true,
      data: {
        ...chat,
        messages: messagesWithReplies as unknown as Message[],
        participants: otherUser ? [otherUser] : [],
      },
    };
  } catch (error) {
    return { success: false, error: 'Failed' };
  }
}

export async function getMessagesAction(
  chatId: string,
  cursor?: Date,
  limit = 50
): Promise<{ success: true; data: Message[] } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    const fetchedMessages = await db.query.messages.findMany({
      where: and(
        eq(messages.chatId, chatId),
        cursor ? lt(messages.createdAt, cursor) : undefined
      ),
      orderBy: [desc(messages.createdAt)],
      limit,
      with: {
        replyTo: {
          with: { sender: true }
        }
      }
    });

    const messagesWithReplies = fetchedMessages.reverse().map(msg => ({
      ...msg,
      replyDetails: msg.replyTo ? {
        id: msg.replyTo.id,
        content: msg.replyTo.content,
        sender: { name: msg.replyTo.sender?.name || 'Unknown' }
      } : null
    }));

    return { success: true, data: messagesWithReplies as unknown as Message[] };
  } catch (error) {
    console.error('Error fetching messages:', error);
    return { success: false, error: 'Failed to fetch messages' };
  }
}

export async function searchUsersAction(
  query: string,
): Promise<{ success: true; data: User[] } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  const myId = session.user.id;

  try {
    if (!query) {
      // Find all chats where I am a participant
      const myChats = await db.query.chats.findMany({
        where: or(eq(chats.userId, myId), eq(chats.recipientId, myId)),
      });

      // Get unique IDs of people I've chatted with
      const participantIds = myChats
        .map((c) => (c.userId === myId ? c.recipientId : c.userId))
        .filter(Boolean) as string[];

      if (participantIds.length === 0) {
        return { success: true, data: [] };
      }

      const results = await db.query.users.findMany({
        where: and(ne(users.id, myId), or(...participantIds.map((id) => eq(users.id, id)))),
      });

      return { success: true, data: results };
    }

    const results = await db.query.users.findMany({
      where: and(
        ne(users.id, myId),
        or(ilike(users.name, `%${query}%`), ilike(users.email, `%${query}%`)),
      ),
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

export async function sendMessageAction(
  chatId: string,
  content: string,
  replyToId?: string,
  attachments: Attachment[] = [],
): Promise<{ success: true; data: Message } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };


  const trimmedContent = content.trim();
  const hasAttachments = attachments.length > 0;

  if (!trimmedContent && !hasAttachments) {
    return { success: false, error: 'Message must have content or attachments' };
  }

  try {
    const [newMessage] = await db
      .insert(messages)
      .values({
        chatId,
        senderId: session.user.id,
        content: trimmedContent,
        replyToId: replyToId || null,
        attachments: attachments,
      })
      .returning();

    // Fetch reply details if exists to return full object immediately (optimistic update support)
    let replyDetails = null;
    if (replyToId) {
      const replyMsg = await db.query.messages.findFirst({
        where: eq(messages.id, replyToId),
      });
      if (replyMsg) {
        const sender = await db.query.users.findFirst({
          where: eq(users.id, replyMsg.senderId),
        });
        replyDetails = {
          id: replyMsg.id,
          sender: { name: sender?.name },
          content: replyMsg.content,
        };
      }
    }

    return { success: true, data: { ...newMessage, replyDetails } as unknown as Message };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}

export async function deleteMessageAction(
  messageId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    const message = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });

    if (!message) return { success: false, error: 'Message not found' };
    if (message.senderId !== session.user.id) return { success: false, error: 'Forbidden' };

    // Media Cleanup
    if (supabaseService && message.attachments && message.attachments.length > 0) {
      const paths = message.attachments
        .map((a) => {
          const parts = a.url.split('/chat-attachments/');
          return parts.length > 1 ? parts[1] : null;
        })
        .filter((p) => p !== null) as string[];

      if (paths.length > 0) {
        const { error } = await supabaseService.storage.from('chat-attachments').remove(paths);
        if (error) {
            console.error('Error removing files from Supabase:', error);
        }
      }
    }

    // Strict ownership check in delete query
    await db.delete(messages).where(
        and(
            eq(messages.id, messageId),
            eq(messages.senderId, session.user.id)
        )
    );
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting message:', error);
    return { success: false, error: 'Failed to delete message' };
  }
}

export async function deleteChatAction(
  chatId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    // Verify participation
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (!chat) return { success: false, error: 'Chat not found' };
    if (chat.userId !== session.user.id && chat.recipientId !== session.user.id) {
      return { success: false, error: 'Forbidden' };
    }

    // Media Cleanup
    if (supabaseService) {
        const chatMessages = await db.query.messages.findMany({
            where: eq(messages.chatId, chatId),
            columns: {
                attachments: true
            }
        });

        const allPaths: string[] = [];
        for (const msg of chatMessages) {
            if (msg.attachments && Array.isArray(msg.attachments)) {
                msg.attachments.forEach((a) => {
                     // Ensure attachment has url property
                     if (a && typeof a.url === 'string') {
                        const parts = a.url.split('/chat-attachments/');
                        if (parts.length > 1) allPaths.push(parts[1]);
                     }
                });
            }
        }

        if (allPaths.length > 0) {
            // Batch delete
             const { error } = await supabaseService.storage.from('chat-attachments').remove(allPaths);
             if (error) {
                 console.error('Error removing chat files from Supabase:', error);
             }
        }
    }

    await db.delete(chats).where(eq(chats.id, chatId));

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error deleting chat:', error);
    return { success: false, error: 'Failed to delete chat' };
  }
}

export async function markAsReadAction(
  chatId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.chatId, chatId),
          ne(messages.senderId, session.user.id),
          eq(messages.isRead, false),
        ),
      );

    return { success: true };
  } catch (error) {
    console.error('Error marking as read:', error);
    return { success: false, error: 'Failed to mark messages as read' };
  }
}

// Оптимізований getChatsAction
export async function getChatsAction(): Promise<{ success: true; data: FullChat[] } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    const myChats = await db.query.chats.findMany({
      where: or(eq(chats.userId, session.user.id), eq(chats.recipientId, session.user.id)),
      with: {
        recipient: true,
        user: true,
        messages: {
          orderBy: [desc(messages.createdAt)],
          limit: 1,
        },
      },
      orderBy: [desc(chats.createdAt)],
    });

    const formattedChats = myChats.map((chat) => {
      const otherUser = chat.userId === session.user.id ? chat.recipient : chat.user;
      return {
        ...chat,
        participants: otherUser ? [otherUser] : [],
        messages: chat.messages,
      };
    });

    return { success: true, data: formattedChats as unknown as FullChat[] };
  } catch (error) {
    console.error('Error in getChatsAction:', error);
    return { success: false, error: 'Failed to fetch chats' };
  }
}

export async function updateLastSeenAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  try {
    await db.update(users).set({ lastSeen: new Date() }).where(eq(users.id, session.user.id));

    return { success: true };
  } catch (error) {
    console.error('Error updating last seen:', error);
    return { success: false, error: 'Failed to update last seen' };
  }
}
