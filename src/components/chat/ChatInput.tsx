'use client';

import { Send, Paperclip } from 'lucide-react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useSendMessage } from '@/hooks/useChatHooks';
import { useAttachment } from '@/hooks/useAttachment';
import { ComposerAddons } from './ComposerAddons';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@/types';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  chatId: string;
  setTyping: (typing: boolean) => void;
  replyToId?: string | null;
  onReplyCancel?: () => void;
  onMessageSent?: () => void;
}

export default function ChatInput({ 
  chatId, 
  setTyping, 
  replyToId, 
  onReplyCancel,
  onMessageSent 
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const { attachments, uploadFile, removeAttachment, clearAttachments, isUploading } = useAttachment(chatId);
  const sendMessage = useSendMessage(chatId);
  
  // Міняємо тип рефа на HTMLTextAreaElement
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Автоматичне розширення висоти
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'inherit'; // Скидаємо висоту, щоб правильно вирахувати scrollHeight
      const scrollHeight = textarea.scrollHeight;
      // Обмежуємо максимальну висоту (наприклад, 200px)
      textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [content]);

  const replyToMessage = useMemo(() => {
    if (!replyToId) return null;
    const data = queryClient.getQueryData<InfiniteData<Message[], Date | undefined>>(['messages', chatId]);
    if (!data) return null;
    return data.pages.flat().find(m => m.id === replyToId) || null;
  }, [replyToId, chatId, queryClient]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = content.trim();
    const hasAttachments = attachments.length > 0;
    
    if ((!trimmed && !hasAttachments) || sendMessage.isPending || isUploading) return;

    setContent('');
    setTyping(false);
    if (onReplyCancel) onReplyCancel();
    
    const attachmentsBackup = [...attachments];
    clearAttachments();

    try {
      await sendMessage.mutateAsync({ 
        content: trimmed, 
        replyToId: replyToId || undefined,
        attachments: attachmentsBackup.map(({ id, type, url, metadata }) => ({ id, type, url, metadata }))
      });
      if (onMessageSent) onMessageSent();
    } catch (error) {
      console.error('Failed to send message:', error);
      setContent(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Надсилаємо на Enter, але робимо перенос на Shift + Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    setTyping(content.length > 0);
  }, [content, setTyping]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        uploadFile(files[i]);
      }
    }
    e.target.value = '';
  };

  const isButtonVisible = content.trim().length > 0 || attachments.length > 0;

  return (
    <div className="flex flex-col border-t border-white/10 backdrop-blur-xl bg-black/40" style={{ willChange: 'transform' }}>
      <ComposerAddons
        attachments={attachments}
        onAttachmentRemove={removeAttachment}
        replyTo={replyToMessage}
        onReplyCancel={onReplyCancel}
        otherParticipantName="User"
      />
      
      <form onSubmit={handleSubmit} className="p-3 sm:p-4 flex gap-2 items-end">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          className="hidden"
          accept="image/*,.pdf,.docx"
        />
        
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-3 mb-0.5 rounded-full text-gray-400 hover:bg-white/10 transition-all duration-300"
        >
          <Paperclip size={20} />
        </button>
        
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={sendMessage.isPending}
            className={cn(
              "w-full bg-white/5 border border-white/10 rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 text-sm text-white placeholder:text-gray-500",
              "focus:outline-none focus:border-blue-500 transition-all duration-300 disabled:opacity-50",
              "resize-none overflow-y-auto leading-relaxed"
            )}
            style={{ minHeight: '44px' }}
          />
        </div>

        {isButtonVisible && (
          <button
            type="submit"
            disabled={sendMessage.isPending || isUploading || (!content.trim() && attachments.length === 0)}
            className="p-3 mb-0.5 rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all duration-300 shadow-lg shadow-blue-600/20 shrink-0"
          >
            <Send size={20} className={sendMessage.isPending || isUploading ? 'animate-pulse' : ''} />
          </button>
        )}
      </form>
    </div>
  );
}