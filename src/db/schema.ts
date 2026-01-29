import { relations } from 'drizzle-orm';
import { 
  boolean, 
  jsonb, 
  pgTable, 
  text, 
  timestamp, 
  uuid, 
  index,
  type AnyPgColumn 
} from 'drizzle-orm/pg-core';
import type { Attachment } from '@/types';

// --- ТАБЛИЦЯ КОРИСТУВАЧІВ ---
export const users = pgTable('user', {
  id: uuid('id').primaryKey(), 
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  lastSeen: timestamp('last_seen', { mode: 'date' }).defaultNow(),
}, (table) => ({
  emailIdx: index('idx_user_email').on(table.email), // Для швидкого пошуку контактів
}));

// --- ТАБЛИЦЯ ЧАТІВ ---
export const chats = pgTable('chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  recipientId: uuid('recipient_id')
    .references(() => users.id, { onDelete: 'cascade' }),
  
  userLastReadId: uuid('user_last_read_id')
    .references((): AnyPgColumn => messages.id, { onDelete: 'set null' }),
  recipientLastReadId: uuid('recipient_last_read_id')
    .references((): AnyPgColumn => messages.id, { onDelete: 'set null' }),

  title: text('title').notNull().default('New Chat'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Для швидкого виведення списку чатів конкретного юзера
  userRecipientIdx: index('idx_chats_users').on(table.userId, table.recipientId),
}));

// --- ТАБЛИЦЯ ПОВІДОМЛЕНЬ ---
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id')
    .notNull()
    .references((): AnyPgColumn => chats.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content'),
  attachments: jsonb('attachments').$type<Attachment[]>().notNull().default([]),
  
  replyToId: uuid('reply_to_id')
    .references((): AnyPgColumn => messages.id, { onDelete: 'set null' }),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // КРИТИЧНО: Пришвидшує рендер чату та сортування за часом
  chatCreatedIdx: index('idx_messages_chat_created').on(table.chatId, table.createdAt),
  // Пришвидшує пошук повідомлень від конкретного відправника
  senderIdx: index('idx_messages_sender').on(table.senderId),
}));

// --- ВІДНОСИНИ (RELATIONS) ---
export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats, { relationName: 'creator' }),
  messages: many(messages),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, { 
    fields: [chats.userId], 
    references: [users.id], 
    relationName: 'creator' 
  }),
  recipient: one(users, {
    fields: [chats.recipientId],
    references: [users.id],
    relationName: 'recipient',
  }),
  userLastReadMessage: one(messages, {
    fields: [chats.userLastReadId],
    references: [messages.id],
  }),
  recipientLastReadMessage: one(messages, {
    fields: [chats.recipientLastReadId],
    references: [messages.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { 
    fields: [messages.chatId], 
    references: [chats.id] 
  }),
  sender: one(users, { 
    fields: [messages.senderId], 
    references: [users.id] 
  }),
  replyTo: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
    relationName: 'replyingTo',
  }),
}));

export const uploadAudit = pgTable('upload_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userTimeIdx: index('idx_upload_audit_user_time').on(table.userId, table.createdAt),
}));