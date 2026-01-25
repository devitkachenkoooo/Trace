'use client';

import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { use, useEffect, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ChatInput from '@/components/chat/ChatInput';
import { MessageBubble } from '@/components/chat/MessageBubble';
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
    messages,
    isLoading: isMessagesLoading,
    isTyping,
    setTyping,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(id, session?.user?.id);
  const markAsRead = useMarkAsRead();
  const { onlineUsers } = usePresence(session?.user?.id);

  const deleteMessage = useDeleteMessage(id);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { scrollToMessage, highlightedId } = useScrollToMessage(
    virtuosoRef,
    messages,
    fetchNextPage,
    hasNextPage
  );
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // 1. Позначення як прочитане
  useEffect(() => {
    if (id) {
      markAsRead.mutate(id);
    }
  }, [id, markAsRead.mutate]);

  // 2. Обробник реплаю
  const handleReply = (message: Message) => {
    setReplyingTo(message);
    // Scroll to bottom so input and reply preview are seen
    setTimeout(() => {
      virtuosoRef.current?.scrollToIndex({
        index: messages.length - 1,
        behavior: 'smooth',
      });
    }, 100);
  };

  if (isChatLoading || (isMessagesLoading && !messages.length)) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading chat...
      </div>
    );
  }

  if (!chat) return null;

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
    <div className="flex flex-col h-full w-full bg-background relative overflow-hidden">
      
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 flex items-center justify-between backdrop-blur-xl bg-black/20 sticky top-0 z-20">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border border-white/10 ring-2 ring-white/5">
            <Image
              src={otherParticipant?.image || '/default-avatar.png'}
              alt={otherParticipant?.name || 'User'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 40px, 48px"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
              {otherParticipant?.name || 'Unknown User'}
            </h2>
            <p className={`text-[10px] sm:text-xs transition-colors ${isTypingNow || isOnline ? 'text-blue-400 font-medium' : 'text-gray-500'}`}>
              {statusText}
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 relative min-h-0">
        <Virtuoso
          ref={virtuosoRef}
          data={messages}
          initialTopMostItemIndex={messages.length - 1}
          followOutput={'auto'}
          className="no-scrollbar"
          atBottomStateChange={(atBottom) => {
            setShowScrollButton(!atBottom);
          }}
          startReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          itemContent={(_index, message) => (
            <div className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full py-1">
              <MessageBubble
                key={message.id}
                message={message}
                currentUserId={session?.user?.id}
                onReply={handleReply}
                onDelete={setMessageToDelete}
                onScrollToMessage={scrollToMessage}
                isHighlighed={highlightedId === message.id}
                otherParticipantName={otherParticipant?.name || undefined}
              />
            </div>
          )}
          components={{
            Header: () => (
              <div className="py-10 text-center">
                {isFetchingNextPage ? (
                  <span className="text-xs text-gray-500">Loading older messages...</span>
                ) : !hasNextPage && messages.length > 0 ? (
                  <span className="text-xs text-gray-500 italic">Beginning of time</span>
                ) : null}
              </div>
            ),
            Footer: () => <div className="h-4" />
          }}
        />

        {/* Scroll to Bottom Button */}
        <AnimatePresence>
          {showScrollButton && (
            <motion.button
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              onClick={() => virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: 'smooth' })}
              className="absolute bottom-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-xl text-white shadow-2xl transition-all z-10 group"
            >
              <ChevronDown className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input Section */}
      <div className="w-full border-t border-white/5 bg-black/20 backdrop-blur-xl z-20">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-4">
          <ChatInput
            chatId={id}
            setTyping={setTyping}
            replyToId={replyingTo?.id}
            onReplyCancel={() => setReplyingTo(null)}
            onMessageSent={() => {
              // Forced scroll to bottom after sending
              setTimeout(() => {
                virtuosoRef.current?.scrollToIndex({
                  index: messages.length - 1,
                  behavior: 'smooth',
                });
              }, 100);
            }}
          />
        </div>
        <div className="h-[env(safe-area-inset-bottom,16px)]" />
      </div>

      <ConfirmationDialog
        open={!!messageToDelete}
        onOpenChange={(open) => !open && setMessageToDelete(null)}
        title="Delete Message"
        description="Are you sure you want to delete this message?"
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