'use client';

import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useChats } from '@/hooks/useChatHooks';

export default function ChatList() {
  const { data: chats, isLoading } = useChats();
  const { data: session } = useSession();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
        <p className="text-sm text-gray-500">Завантаження...</p>
      </div>
    );
  }

  if (!chats || chats.length === 0) {
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
      {chats.map((chat) => {
        const lastMessage = chat.messages[0];
        const isUnread =
          lastMessage && !lastMessage.isRead && lastMessage.senderId !== session?.user?.id;

        return (
          <Link
            key={chat.id}
            href={`/chat/${chat.id}`}
            className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 group relative"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/10 shrink-0">
              <MessageSquare className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                  {chat.title}
                </p>
                {isUnread && (
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-[11px] text-gray-500 truncate min-w-0">
                  {lastMessage?.content || 'Немає повідомлень'}
                </p>
                <p
                  className="text-[10px] text-gray-500 truncate uppercase tracking-wider font-semibold shrink-0"
                  suppressHydrationWarning
                >
                  {new Intl.DateTimeFormat('uk-UA', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(chat.createdAt))}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
