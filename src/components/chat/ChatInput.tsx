'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useSendMessage, useTyping } from '@/hooks/useChatHooks';
import { useSession } from 'next-auth/react';

interface ChatInputProps {
  chatId: string;
}

export default function ChatInput({ chatId }: ChatInputProps) {
  const { data: session } = useSession();
  const [content, setContent] = useState('');
  const sendMessage = useSendMessage(chatId);
  const { setTyping } = useTyping(chatId, session?.user?.id);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sendMessage.isPending) return;

    setContent('');
    setTyping(false);
    
    try {
      await sendMessage.mutateAsync({ content: trimmed });
    } catch (error) {
      // Preserve content on error so user doesn't lose it
      setContent(trimmed);
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (content.length > 0) {
      setTyping(true);
    } else {
      setTyping(false);
    }
  }, [content, setTyping]);

  const isButtonVisible = content.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-white/10 flex gap-2 items-center">
      <div className="flex-1 relative">
        <input
          ref={inputRef}
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={sendMessage.isPending}
          className="w-full bg-white/5 border border-white/10 rounded-full px-5 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-all disabled:opacity-50"
        />
      </div>
      
      {isButtonVisible && (
        <button
          type="submit"
          disabled={sendMessage.isPending || !content.trim()}
          className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-lg shadow-blue-600/20"
        >
          <Send size={20} className={sendMessage.isPending ? 'animate-pulse' : ''} />
        </button>
      )}
    </form>
  );
}
