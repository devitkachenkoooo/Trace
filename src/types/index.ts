export interface User {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
  lastSeen?: Date | null;
}

export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'file';
  url: string;
  isDeleted?: boolean;
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
  createdAt: string;
  updatedAt?: string | null;
  replyToId?: string | null;
  replyDetails?: {
    id: string;
    sender: { name?: string | null };
    content: string;
    senderId?: string;
    attachments?: Attachment[];
  } | null;
  replyTo?: Message;
  sender?: User | null;
  isOptimistic?: boolean;
}

export interface Chat {
  id: string;
  userId: string;
  recipientId?: string | null;
  userLastReadId?: string | null;
  recipientLastReadId?: string | null;
  userLastRead?: { id: string; createdAt: string } | null;
  recipientLastRead?: { id: string; createdAt: string } | null;
  title: string;
  createdAt: string;
}

export interface FullChat extends Chat {
  messages: Message[];
  participants: User[];
  recipient?: User | null;
  user?: User | null;
}
