'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useChatStore } from '@/store/useChatStore';

export default function Home() {
  const { chats } = useChatStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] text-center px-4">
        <h2 className="text-3xl font-bold text-gray-200 mb-2">Welcome to Trace</h2>
        <p className="text-gray-400">Start a new conversation</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6 text-white">Chats</h1>
      <div className="space-y-3">
        {chats.map((chat) => {
          const otherParticipant = chat.participants[0];
          const lastMessage = chat.messages[chat.messages.length - 1];

          return (
            <Link
              key={chat.id}
              href={`/chat/${chat.id}`}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 hover:border-white/10 group"
            >
              <div className="relative w-12 h-12 rounded-full overflow-hidden border border-white/10 group-hover:border-white/20 transition-colors">
                <Image
                  src={otherParticipant.avatar}
                  alt={otherParticipant.name}
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-gray-200 group-hover:text-white transition-colors truncate">
                    {otherParticipant.name}
                  </h3>
                  {lastMessage && isMounted && (
                    <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors whitespace-nowrap ml-2">
                      {new Date(lastMessage.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
                {lastMessage && (
                  <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors truncate">
                    {lastMessage.content}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
