export interface User {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
  lastSeen?: Date | null;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  createdAt: Date;
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
