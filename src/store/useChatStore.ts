import { create } from 'zustand';

export interface User {
  id: string;
  name: string;
  avatar: string;
  email: string;
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
}

export interface Chat {
  id: string;
  participants: User[];
  messages: Message[];
}

interface ChatState {
  chats: Chat[];
  getChatById: (id: string) => Chat | undefined;
}

const mockChats: Chat[] = [
  {
    id: '1',
    participants: [
      {
        id: 'u2',
        name: 'Alice Johnson',
        avatar: 'https://i.pravatar.cc/150?u=u2',
        email: 'alice@example.com',
      },
    ],
    messages: [
      {
        id: 'm1',
        senderId: 'u2',
        content: 'Hey! How are you?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      },
      {
        id: 'm2',
        senderId: 'u1',
        content: 'I am good, thanks! How about you?',
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
    ],
  },
  {
    id: '2',
    participants: [
      {
        id: 'u3',
        name: 'Bob Smith',
        avatar: 'https://i.pravatar.cc/150?u=u3',
        email: 'bob@example.com',
      },
    ],
    messages: [
      {
        id: 'm3',
        senderId: 'u3',
        content: 'Did you see the new design?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      },
    ],
  },
];

export const useChatStore = create<ChatState>((_set, get) => ({
  chats: mockChats,
  getChatById: (id) => get().chats.find((chat) => chat.id === id),
}));
