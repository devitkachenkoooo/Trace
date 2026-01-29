'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import ChatInput from '@/components/chat/ChatInput';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  useChatDetails,
  useDeleteMessage,
  useMessages,
  usePresence,
  useChatTyping,
  useScrollToMessage,
} from '@/hooks/useChatHooks';
import { formatRelativeTime } from '@/lib/date-utils';
import type { Message, User } from '@/types';

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useSupabaseAuth();

  const { data: chat, isLoading: isChatLoading, isError } = useChatDetails(id);
  const {
    data: messagesData,
    isLoading: isMessagesLoading,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  } = useMessages(id);

  const { isTyping: typingUsers, setTyping } = useChatTyping(id);
  const messages = messagesData?.pages.flat() || [];
  const { onlineUsers } = usePresence();
  const deleteMessage = useDeleteMessage(id);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { scrollToMessage, highlightedId } = useScrollToMessage(
    virtuosoRef,
    messages,
    fetchPreviousPage,
    hasPreviousPage,
  );

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Редірект при помилці
  useEffect(() => {
    if (!isChatLoading && (isError || (!chat && !isMessagesLoading))) {
      router.replace('/');
    }
  }, [isChatLoading, chat, isError, router, isMessagesLoading]);

  // Хендлери для взаємодії
  const handleReply = (message: Message) => {
    setEditingMessage(null);
    setReplyingTo(message);
  };

  const handleEdit = (message: Message) => {
    setReplyingTo(null);
    setEditingMessage(message);
  };

  if (isChatLoading || (isMessagesLoading && !messages.length)) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium animate-pulse">Завантаження чату...</p>
        </div>
      </div>
    );
  }

  if (!chat || isError) return null;

  const otherParticipant = chat.participants.find((p: User) => p.id !== user?.id);
  const isOnline = otherParticipant && onlineUsers.has(otherParticipant.id);
  const isTypingNow = otherParticipant && typingUsers[otherParticipant.id];

  const isUserCreator = chat.userId === user?.id;
  const recipientLastReadAt = isUserCreator 
    ? chat.recipientLastRead?.createdAt 
    : chat.userLastRead?.createdAt;

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] w-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-white/5 flex items-center justify-between backdrop-blur-xl bg-black/40 sticky top-0 z-20">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border border-white/10 shadow-lg">
            <Image
              src={otherParticipant?.image || '/default-avatar.png'}
              alt={otherParticipant?.name || 'User'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 40px, 44px"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate leading-tight">
              {otherParticipant?.name || 'Невідомий користувач'}
            </h2>
            <div className="text-[10px] sm:text-[11px] font-medium transition-colors">
              {isTypingNow ? (
                <span className="text-blue-400 animate-pulse">друкує...</span>
              ) : isOnline ? (
                <span className="text-green-400">в мережі</span>
              ) : (
                <span className="text-gray-500">
                  {otherParticipant?.lastSeen ? `був(ла) ${formatRelativeTime(otherParticipant.lastSeen)}` : 'не в мережі'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 relative min-h-0">
        {messages.length === 0 && !isMessagesLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-4 border border-white/10 shadow-2xl">
              <span className="text-3xl">💬</span>
            </div>
            <h3 className="text-white font-semibold text-lg mb-1">Поки що порожньо</h3>
            <p className="text-gray-500 text-sm max-w-[280px]">Напишіть щось, щоб розпочати бесіду!</p>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            initialTopMostItemIndex={messages.length - 1}
            // "smooth" для автоматичного скролу нових повідомлень від співрозмовника
            followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
            className="no-scrollbar"
            atBottomStateChange={(atBottom) => setShowScrollButton(!atBottom)}
            startReached={() => {
              if (hasPreviousPage && !isFetchingPreviousPage) {
                fetchPreviousPage();
              }
            }}
            itemContent={(_index, message) => (
              <div className="px-2 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full py-0.5">
                <MessageBubble
                  key={message.id}
                  message={message}
                  currentUserId={user?.id}
                  recipientLastReadAt={recipientLastReadAt}
                  onReply={handleReply}
                  onEdit={handleEdit}
                  onDelete={setMessageToDelete}
                  onScrollToMessage={(id) => scrollToMessage(id, { align: 'center' })}
                  isHighlighed={highlightedId === message.id}
                  otherParticipantName={otherParticipant?.name || undefined}
                />
              </div>
            )}
            components={{
              Header: () => (
                <div className="py-10 text-center">
                  {isFetchingPreviousPage ? (
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest animate-pulse">
                      Завантаження...
                    </span>
                  ) : !hasPreviousPage && messages.length > 0 ? (
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest opacity-50 italic">
                      Початок історії
                    </span>
                  ) : null}
                </div>
              ),
              // Footer виступає як якір для скролу в самий низ
              Footer: () => <div className="h-6 w-full" />,
            }}
          />
        )}

        {/* Floating Scroll Button */}
        <AnimatePresence>
          {showScrollButton && messages.length > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={() => {
                virtuosoRef.current?.scrollToIndex({
                  index: messages.length, // Скролимо до футера
                  behavior: 'smooth',
                  align: 'end',
                });
              }}
              className="absolute bottom-6 right-6 p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-2xl text-white shadow-2xl z-10"
            >
              <ChevronDown className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input Section */}
      <div className="w-full border-t border-white/5 bg-black/40 backdrop-blur-2xl z-20">
        <div className="max-w-5xl mx-auto px-1.5 sm:px-4 py-2 sm:py-4">
          <ChatInput
            chatId={id}
            setTyping={setTyping}
            replyToId={replyingTo?.id}
            onReplyCancel={() => setReplyingTo(null)}
            editingMessage={editingMessage}
            onEditCancel={() => setEditingMessage(null)}
            onMessageSent={() => {
              const wasEditing = !!editingMessage;
              setReplyingTo(null);
              setEditingMessage(null);
              
              // Якщо це не редагування — плавно скролимо до самого низу (до футера)
              if (!wasEditing) {
                requestAnimationFrame(() => {
                  virtuosoRef.current?.scrollToIndex({
                    index: messages.length,
                    behavior: 'smooth',
                    align: 'end',
                  });
                });
              }
            }}
          />
        </div>
        <div className="h-[env(safe-area-inset-bottom,16px)]" />
      </div>

      <ConfirmationDialog
        open={!!messageToDelete}
        onOpenChange={(open) => !open && setMessageToDelete(null)}
        title="Видалити повідомлення?"
        description="Ця дія незворотна. Повідомлення зникне для обох учасників."
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