'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getFullChatAction } from '@/actions/chat-actions';

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session } = useSession();
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null);
  const [chat, setChat] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    async function fetchChat() {
      if (resolvedParams?.id) {
        setIsLoading(true);
        const result = await getFullChatAction(resolvedParams.id);
        if (result.success) {
          setChat(result.data);
        }
        setIsLoading(false);
      }
    }
    fetchChat();
  }, [resolvedParams]);

  if (isLoading || !resolvedParams) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)] text-gray-400">
        Loading chat...
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)] text-gray-400">
        Chat not found
      </div>
    );
  }

  const otherParticipant = chat.participants[0];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 flex items-center gap-4">
        <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/10">
          <Image
            src={otherParticipant?.image || '/default-avatar.png'}
            alt={otherParticipant?.name || 'User'}
            fill
            className="object-cover"
            sizes="40px"
          />
        </div>
        <h2 className="text-xl font-bold text-white">{otherParticipant?.name || 'Unknown User'}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {chat.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Немає повідомлень. Почніть спілкування!
          </div>
        ) : (
          chat.messages.map((message: any) => {
            const isMe = message.senderId === session?.user?.id;
            return (
              <div key={message.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white/10 text-gray-200 rounded-bl-none'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <span className="text-[10px] opacity-70 mt-1 block">
                    {new Date(message.createdAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Placeholder */}
      <div className="p-4 border-t border-white/10">
        <div className="bg-white/5 rounded-full px-4 py-3 text-gray-500 text-sm border border-white/5">
          Type a message (Coming in Phase 2)...
        </div>
      </div>
    </div>
  );
}

ChatPage.whyDidYouRender = true;
