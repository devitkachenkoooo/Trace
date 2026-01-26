'use client';

import { MessageSquare, Trash2, Clock } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { useChats, useDeleteChat } from '@/hooks/useChatHooks';
import { formatRelativeTime } from '@/lib/date-utils'; // Імпортуємо наш канон

export default function ChatList() {
  const { data: chats, isLoading } = useChats();
  const { data: session } = useSession();
  const deleteChat = useDeleteChat();
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  
  const handleChatClick = () => {
    window.dispatchEvent(new CustomEvent('close-mobile-sidebar'));
  };

  if (isLoading) return <div className="p-8 text-center text-sm text-gray-500 mt-10">Завантаження...</div>;
  if (!chats?.length) return <div className="p-8 text-center text-sm text-gray-500 mt-10">Немає діалогів</div>;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {chats.map((chat) => {
          const lastMessage = chat.messages[0];
          const isUnread = lastMessage && !lastMessage.isRead && lastMessage.senderId !== session?.user?.id;

          return (
            <ContextMenu key={chat.id}>
              <ContextMenuTrigger>
                <Link
                  href={`/chat/${chat.id}`}
                  onClick={handleChatClick}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 group"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/10 shrink-0">
                    <MessageSquare className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white">
                        {chat.title}
                      </p>
                      {/* Додаємо час останнього повідомлення */}
                      {lastMessage && (
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">
                          {formatRelativeTime(lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-[11px] text-gray-500 truncate flex-1">
                        {lastMessage?.content || 'Немає повідомлень'}
                      </p>
                      {isUnread && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] shrink-0" />
                      )}
                    </div>
                  </div>
                </Link>
              </ContextMenuTrigger>

              <ContextMenuContent className="z-[110]">
                <ContextMenuItem onClick={handleChatClick} className="gap-2">
                  <MessageSquare className="w-4 h-4" /> Open Chat
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem 
                  onClick={() => setChatToDelete(chat.id)} 
                  className="text-red-400 focus:text-red-400 focus:bg-red-500/10 gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Delete Chat
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      <ConfirmationDialog
        open={!!chatToDelete}
        onOpenChange={(open) => !open && setChatToDelete(null)}
        title="Delete Chat"
        description="Are you sure? This action cannot be undone."
        onConfirm={() => {
          if (chatToDelete) {
            deleteChat.mutate(chatToDelete);
            setChatToDelete(null);
          }
        }}
        isLoading={deleteChat.isPending}
      />
    </>
  );
}