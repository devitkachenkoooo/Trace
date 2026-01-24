'use client';

import { Menu, MessageSquare, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import ChatList from './ChatList';
import ContactsList from './ContactsList';
import SearchInput from './SearchInput';

interface SidebarShellProps {
  initialChats: any[];
}

export default function SidebarShell({ initialChats }: SidebarShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = searchParams.get('tab') || 'chats';
  const query = searchParams.get('q') || '';

  useEffect(() => {
    if (!searchParams.get('tab')) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'chats');
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, router]);

  const setTab = (newTab: 'chats' | 'contacts') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', newTab);
    if (newTab === 'chats') {
      params.delete('q');
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <aside className="sticky top-16 h-[calc(100vh-64px)] w-80 bg-black border-r border-white/10 flex flex-col z-40 shrink-0">
      {/* Header */}
      <div className="pt-8 pb-4">
        <div className="px-6 mb-6 flex items-center justify-between">
          <button
            type="button"
            className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* View Toggle */}
        <div className="px-4 mb-6">
          <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setTab('chats')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === 'chats'
                  ? 'bg-white text-black shadow-lg shadow-white/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Діалоги
            </button>
            <button
              type="button"
              onClick={() => setTab('contacts')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === 'contacts'
                  ? 'bg-white text-black shadow-lg shadow-white/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Контакти
            </button>
          </div>
        </div>

        {/* Contacts Specific UI */}
        {tab === 'contacts' && (
          <SearchInput />
        )}

        {/* Chats Specific UI */}
        {tab === 'chats' && <div className="h-4" />}
      </div>

      {/* Lists */}
      <div className="flex-1 flex flex-col min-h-0 py-2 overflow-hidden">
        {tab === 'chats' ? (
          <>
            <div className="px-6 mb-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Ваші діалоги
              </h2>
            </div>
            <ChatList initialChats={initialChats} />
          </>
        ) : (
          <ContactsList query={query} />
        )}
      </div>
    </aside>
  );
}

SidebarShell.whyDidYouRender = true;
