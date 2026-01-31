import { 
  users, 
  chats, 
  messages 
} from '@/db/schema';

// Automated type inference from Drizzle schema
export type User = typeof users.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect & {
  // UI-specific fields with snake_case naming
  reply_details?: {
    id: string;
    sender: { name?: string | null };
    content: string;
    sender_id?: string;
    attachments?: Attachment[];
  } | null;
  reply_to?: Message;
  sender?: User | null;
  is_optimistic?: boolean;
};

// Keep Attachment interface as it's used in schema
export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'file';
  url: string;
  is_deleted?: boolean;
  metadata: {
    name: string;
    size: number;
    width?: number;
    height?: number;
    expired?: boolean;
  };
}

// Extended types for UI with relations
export type FullChat = Chat & {
  messages: Message[];
  participants: User[];
  recipient?: User | null;
  user?: User | null;
  user_last_read?: { id: string; created_at: string } | null;
  recipient_last_read?: { id: string; created_at: string } | null;
};
