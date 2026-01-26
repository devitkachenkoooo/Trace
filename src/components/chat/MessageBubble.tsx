'use client';

import { Reply, Trash2, FileIcon, Download, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import { MessageMediaGrid } from './MessageMediaGrid';
import { formatMessageDate } from '@/lib/date-utils'; // Наш канонічний хелпер

interface MessageBubbleProps {
  message: Message;
  currentUserId: string | undefined;
  onReply: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onScrollToMessage: (messageId: string) => void;
  isHighlighed?: boolean;
  otherParticipantName?: string;
}

export function MessageBubble({
  message,
  currentUserId,
  onReply,
  onDelete,
  onScrollToMessage,
  isHighlighed,
  otherParticipantName,
}: MessageBubbleProps) {
  const isMe = message.senderId === currentUserId;
  const imageAttachments = message.attachments?.filter(a => a.type === 'image') || [];
  const fileAttachments = message.attachments?.filter(a => a.type === 'file') || [];

  return (
    <motion.div
      id={`message-${message.id}`}
      data-highlighted={isHighlighed}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'flex w-full mb-3 px-2.5 sm:px-4 transition-colors duration-500',
        isMe ? 'justify-end' : 'justify-start',
        isHighlighed ? 'bg-white/10 py-2 rounded-lg' : '',
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger className="max-w-[88%] sm:max-w-[70%] lg:max-w-[60%] min-w-0 block">
          <div className={cn('flex flex-col min-w-0 w-full', isMe ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'relative px-4 py-2.5 shadow-2xl border border-white/10 min-w-0 max-w-full flex flex-col',
                isMe
                  ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                  : 'bg-neutral-900/80 backdrop-blur-md text-gray-100 rounded-2xl rounded-tl-sm',
                imageAttachments.length > 0 && !message.content ? 'p-1.5 bg-neutral-900/50' : ''
              )}
              style={{ willChange: 'transform' }}
            >
              {/* Reply Context */}
              {(() => {
                const reply = message.replyDetails || (message.replyTo ? {
                  id: message.replyTo.id,
                  sender: { name: message.replyTo.senderId === currentUserId ? 'You' : otherParticipantName },
                  content: message.replyTo.content
                } : null);

                if (!reply) return null;
                
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onScrollToMessage(reply.id);
                    }}
                    className="mb-2 w-full flex flex-col items-start px-2 py-1 rounded-md bg-black/20 border-l-2 border-blue-400/50 cursor-pointer hover:bg-black/40 transition-colors text-[11px] text-left overflow-hidden min-w-0"
                  >
                    <span className="font-bold text-blue-300 mb-0.5 truncate w-full block">
                      {reply.sender.name || 'Unknown'}
                    </span>
                    <span className="text-white/60 line-clamp-1 italic">
                      {reply.content || 'Attachment'}
                    </span>
                  </button>
                );
              })()}

              {imageAttachments.length > 0 && (
                <div className="rounded-xl overflow-hidden mb-1 w-full">
                  <MessageMediaGrid images={imageAttachments} />
                </div>
              )}

              {message.content && (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-all sm:break-words block w-full max-w-full overflow-hidden min-w-0">
                  {message.content}
                </p>
              )}

              {fileAttachments.length > 0 && (
                <div className="mt-2 space-y-1.5 w-full min-w-0">
                  {fileAttachments.map((file) => {
                    if (file.isDeleted) {
                      return (
                        <div
                          key={file.id}
                          className="flex items-center gap-3 p-2.5 rounded-xl bg-black/20 border border-white/5 w-full min-w-0 opacity-50 select-none"
                        >
                          <div className="p-2 bg-neutral-800 rounded-lg shrink-0">
                            <Clock className="w-5 h-5 text-white/40" />
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden text-left">
                            <p className="text-sm font-medium text-white/40 truncate w-full block">
                              Media expired
                            </p>
                            <p className="text-[10px] text-white/20 uppercase tracking-wider mt-0.5">
                              {file.metadata.name}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <a
                        key={file.id}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-black/30 hover:bg-black/40 transition-all border border-white/5 w-full min-w-0 group"
                      >
                        <div className="p-2 bg-blue-500/10 group-hover:bg-blue-500/20 rounded-lg shrink-0 transition-colors">
                          <FileIcon className="w-5 h-5 text-blue-400" />
                        </div>
                        
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-sm font-medium text-blue-100 truncate w-full block">
                            {file.metadata.name}
                          </p>
                          <p className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">
                            {(file.metadata.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>

                        <Download className="w-4 h-4 text-white/20 group-hover:text-white/50 shrink-0 transition-colors" />
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Час та статус - тепер через наш хелпер */}
              <div className={cn(
                "flex items-center justify-end gap-1 mt-1.5 select-none w-full",
                isMe ? "text-blue-100/50" : "text-white/40"
              )}>
                <span className="text-[9px] font-medium">
                  {formatMessageDate(message.createdAt)}
                </span>
                {isMe && (
                  <span className="text-[9px] font-bold">{message.isRead ? '••' : '•'}</span>
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => onReply(message)} className="gap-2">
            <Reply className="w-4 h-4" />
            Reply
          </ContextMenuItem>
          
          {isMe && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => onDelete(message.id)}
                className="gap-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4" />
                Delete Message
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </motion.div>
  );
}