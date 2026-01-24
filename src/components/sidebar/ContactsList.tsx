'use client';

import { MessageSquarePlus, User as UserIcon } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { getOrCreateChatAction, searchUsersAction } from '@/actions/chat-actions';

interface User {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
}

interface ContactsListProps {
  query: string;
}

export default function ContactsList({ query }: ContactsListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchUsers() {
      setIsLoading(true);
      const result = await searchUsersAction(query);
      if (result.success) {
        setUsers((result.data as User[]) || []);
      }
      setIsLoading(false);
    }
    fetchUsers();
  }, [query]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-gray-500 text-sm">
        Шукаємо...
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
          <UserIcon className="w-6 h-6 text-gray-600" />
        </div>
        <p className="text-sm text-gray-500">
          {query ? 'Нічого не знайдено' : 'Почніть пошук за імʼям або email'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 space-y-1">
      <div className="px-4 mb-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Результати пошуку
        </h2>
      </div>
      {users.map((user) => (
        <div
          key={user.id}
          className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 group"
        >
          <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-white/5 shrink-0">
            {user.image ? (
              <Image src={user.image} alt={user.name || 'User'} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-gray-500" />
              </div>
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
            className="p-2 bg-white/5 hover:bg-white text-gray-400 hover:text-black rounded-lg transition-all opacity-0 group-hover:opacity-100"
            title="Надіслати повідомлення"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

ContactsList.whyDidYouRender = true;
