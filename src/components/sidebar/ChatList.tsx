'use client';

import { MessageSquare } from 'lucide-react';
import Link from 'next/link';

interface Chat {
  id: string;
  title: string;
  createdAt: Date;
  userId: string;
  recipientId?: string | null;
}

interface ChatListProps {
  initialChats: Chat[];
}

export default function ChatList({ initialChats }: ChatListProps) {
  if (!initialChats || initialChats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
          <MessageSquare className="w-6 h-6 text-gray-600" />
        </div>
        <p className="text-sm text-gray-500">Немає активних діалогів</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 space-y-1">
      {initialChats.map((chat) => (
        <Link
          key={chat.id}
          href={`/chat/${chat.id}`}
          className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 group"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/10 shrink-0">
            <MessageSquare className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
              {chat.title}
            </p>
            <p className="text-[10px] text-gray-500 truncate uppercase tracking-wider font-semibold">
              {new Date(chat.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
