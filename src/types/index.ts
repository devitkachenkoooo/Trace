export interface User {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
  lastSeen?: Date | null;
}

export interface Attachment {
  id: string;
  type: 'image' | 'file';
  url: string;
  metadata: {
    name: string;
    size: number;
    width?: number;
    height?: number;
    expired?: boolean;
  };
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  attachments: Attachment[];
  isRead: boolean;
  createdAt: Date;
  replyToId?: string | null;
  replyDetails?: {
    id: string;
    sender: { name?: string | null };
    content: string;
  } | null;
  replyTo?: Message;
  isOptimistic?: boolean;
}

export interface Chat {
  id: string;
  userId: string;
  recipientId?: string | null;
  title: string;
  createdAt: Date;
}

export interface FullChat extends Chat {
  messages: Message[];
  participants: User[];
}
