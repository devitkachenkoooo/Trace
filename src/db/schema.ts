import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { Attachment } from '@/types';

// --- ТАБЛИЦЯ КОРИСТУВАЧІВ (Узгоджена з Supabase) ---

export const users = pgTable('user', {
  id: text('id').primaryKey(), // Supabase Auth UID
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  lastSeen: timestamp('last_seen', { mode: 'date' }).defaultNow(),
});

// --- ТАБЛИЦІ ЧАТІВ ТА ПОВІДОМЛЕНЬ ---

export const chats = pgTable('chats', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  recipientId: text('recipient_id').references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New Chat'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const messages = pgTable('messages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  chatId: text('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  senderId: text('sender_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content'),
  attachments: jsonb('attachments').$type<Attachment[]>().notNull().default([]),
  replyToId: text('reply_to_id'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats),
  messages: many(messages),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, { fields: [chats.userId], references: [users.id], relationName: 'creator' }),
  recipient: one(users, { fields: [chats.recipientId], references: [users.id], relationName: 'recipient' }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  replyTo: one(messages, { 
    fields: [messages.replyToId], 
    references: [messages.id],
    relationName: 'replyingTo' 
  }),
}));