'use client';

import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { use, useEffect } from 'react';
import ChatInput from '@/components/chat/ChatInput';
import { useChatDetails, useMarkAsRead, useMessages, usePresence } from '@/hooks/useChatHooks';

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const { data: chat, isLoading: isChatLoading } = useChatDetails(id);
  const { 
    data: messages, 
    isLoading: isMessagesLoading, 
    isTyping,
    setTyping
  } = useMessages(id, session?.user?.id);
  const markAsRead = useMarkAsRead();
  const { onlineUsers } = usePresence(session?.user?.id);

  useEffect(() => {
    if (id) {
      markAsRead.mutate(id);
    }
  }, [id, markAsRead.mutate]);

  if (isChatLoading || isMessagesLoading) {
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

  const otherParticipant = chat.participants.find(p => p.id !== session?.user?.id);
  const isOnline = otherParticipant && onlineUsers.has(otherParticipant.id);
  const isTypingNow = otherParticipant && isTyping[otherParticipant.id];

  const statusText = isTypingNow
    ? 'Typing...'
    : isOnline
      ? 'Online'
      : otherParticipant?.lastSeen
        ? `Last seen ${new Date(otherParticipant.lastSeen).toLocaleTimeString()}`
        : 'Offline';

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/10">
            <Image
              src={otherParticipant?.image || '/default-avatar.png'}
              alt={otherParticipant?.name || 'User'}
              fill
              className="object-cover"
              sizes="40px"
            />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              {otherParticipant?.name || 'Unknown User'}
            </h2>
            <p className={`text-xs ${isTypingNow || isOnline ? 'text-green-500 font-medium' : 'text-gray-400'}`}>
              {statusText}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col-reverse">

        {!messages || messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Немає повідомлень. Почніть спілкування!
          </div>
        ) : (
          messages.map((message) => {
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
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-[10px] opacity-70 block">
                      {new Date(message.createdAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isMe && (
                      <span className="text-[10px] opacity-70">
                        {message.isRead ? 'Read' : 'Sent'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <ChatInput chatId={id} setTyping={setTyping} />
    </div>
  );
}

ChatPage.whyDidYouRender = true;
