'use client';

import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { use, useEffect, useRef, useState } from 'react';
import ChatInput from '@/components/chat/ChatInput';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ReplyPreview } from '@/components/chat/ReplyPreview';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  useChatDetails,
  useDeleteMessage,
  useMarkAsRead,
  useMessages,
  usePresence,
  useScrollToMessage,
} from '@/hooks/useChatHooks';
import type { Message } from '@/types';

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const { data: chat, isLoading: isChatLoading } = useChatDetails(id);
  const {
    data: messages,
    isLoading: isMessagesLoading,
    isTyping,
    setTyping,
  } = useMessages(id, session?.user?.id);
  const markAsRead = useMarkAsRead();
  const { onlineUsers } = usePresence(session?.user?.id);

  // New Hooks & State
  const deleteMessage = useDeleteMessage(id);
  const { scrollToMessage, highlightedId } = useScrollToMessage();
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCount = useRef(messages?.length || 0);

  // Smart Scroll Logic
  useEffect(() => {
    if (!scrollRef.current || !messages || messages.length === 0) return;

    // In flex-col-reverse, scrollTop 0 is the bottom.
    const isNearBottom = scrollRef.current.scrollTop < 100;
    const lastMessage = messages[0]; // Newest message (at the bottom)
    const isMe = lastMessage?.senderId === session?.user?.id;

    if (messages.length > lastMessageCount.current) {
      if (isMe || isNearBottom) {
        scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    lastMessageCount.current = messages.length;
  }, [messages, session?.user?.id]);

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

  const otherParticipant = chat.participants.find((p) => p.id !== session?.user?.id);
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
            <p
              className={`text-xs ${isTypingNow || isOnline ? 'text-green-500 font-medium' : 'text-gray-400'}`}
            >
              {statusText}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 flex flex-col-reverse"
      >
        {!messages || messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Немає повідомлень. Почніть спілкування!
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              currentUserId={session?.user?.id}
              onReply={setReplyingTo}
              onDelete={setMessageToDelete}
              onScrollToMessage={scrollToMessage}
              isHighlighed={highlightedId === message.id}
              otherParticipantName={otherParticipant?.name || undefined}
            />
          ))
        )}
      </div>

      {/* Input Section */}
      <div className="flex flex-col">
        {replyingTo && (
          <ReplyPreview
            replyingTo={{
              id: replyingTo.id,
              sender:
                replyingTo.senderId === session?.user?.id
                  ? 'You'
                  : otherParticipant?.name || 'Unknown',
              content: replyingTo.content,
            }}
            onCancel={() => setReplyingTo(null)}
          />
        )}
        <ChatInput
          chatId={id}
          setTyping={setTyping}
          replyToId={replyingTo?.id}
          onReplyCancel={() => setReplyingTo(null)}
        />
      </div>

      <ConfirmationDialog
        open={!!messageToDelete}
        onOpenChange={(open) => !open && setMessageToDelete(null)}
        title="Delete Message"
        description="Are you sure you want to delete this message? This action cannot be undone."
        onConfirm={() => {
          if (messageToDelete) {
            deleteMessage.mutate(messageToDelete);
            setMessageToDelete(null);
          }
        }}
        isLoading={deleteMessage.isPending}
      />
    </div>
  );
}

ChatPage.whyDidYouRender = true;
