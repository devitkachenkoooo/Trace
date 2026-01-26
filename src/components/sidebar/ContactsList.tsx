'use client';

import { MessageSquarePlus, User as UserIcon } from 'lucide-react';
import Image from 'next/image';
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { getOrCreateChatAction } from '@/actions/chat-actions';
import { usePresence, useSearchUsers } from '@/hooks/useChatHooks';

interface ContactsListProps {
  query: string;
}

export default function ContactsList({ query }: ContactsListProps) {
  const { user: currentUser } = useSupabaseAuth();
  const { data: users, isLoading } = useSearchUsers(query);
  const { onlineUsers } = usePresence(currentUser?.id);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-500 text-sm">
        Шукаємо...
      </div>
    );
  }

  if (query && query.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
          <UserIcon className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-sm text-gray-500">Введіть принаймні 2 символи для пошуку</p>
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
          <UserIcon className="w-6 h-6 text-gray-600" />
        </div>
        <p className="text-sm text-gray-500">
          {query ? 'Нічого не знайдено' : 'У вас ще немає активних діалогів'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 space-y-1">
      <div className="px-4 mb-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {query ? 'Результати пошуку' : 'Ваші контакти'}
        </h2>
      </div>
      {users.map((user) => {
        const isOnline = onlineUsers.has(user.id);

        return (
          <div
            key={user.id}
            className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 group"
          >
            <div className="relative w-10 h-10 rounded-full shrink-0">
              <div className="w-full h-full rounded-full overflow-hidden border border-white/10 bg-white/5 relative">
                {user.image ? (
                  <Image src={user.image} alt={user.name || 'User'} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-gray-500" />
                  </div>
                )}
              </div>
              {isOnline && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                {user.name || 'Анонім'}
              </p>
              <p className="text-[10px] text-gray-500 truncate lowercase">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => getOrCreateChatAction(user.id)}
              className="p-2 bg-white/5 hover:bg-white text-gray-400 hover:text-black rounded-lg transition-all opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
              title="Надіслати повідомлення"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

ContactsList.whyDidYouRender = true;
