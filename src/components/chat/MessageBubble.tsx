'use client';

import { motion } from 'framer-motion';
import Linkify from 'linkify-react';
import { Clock, Download, FileIcon, Reply, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { formatMessageDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import { MessageMediaGrid } from './MessageMediaGrid';

interface MessageBubbleProps {
  message: Message;
  currentUserId: string | undefined;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onScrollToMessage: (messageId: string) => void;
  isHighlighed?: boolean;
  otherParticipantName?: string;
}

export function MessageBubble({
  message,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onScrollToMessage,
  isHighlighed,
  otherParticipantName,
}: MessageBubbleProps) {
  // Перевіряємо обидва варіанти написання ID для сумісності з БД та оптимістичним об'єктом
  const isMe = (message.senderId || (message as any).sender_id) === currentUserId;
  
  const imageAttachments = message.attachments?.filter((a) => a.type === 'image') || [];
  const fileAttachments = message.attachments?.filter((a) => a.type === 'file') || [];

  return (
    <motion.div
      id={`message-${message.id}`}
      data-highlighted={isHighlighed}
      layout
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
                imageAttachments.length > 0 && !message.content ? 'p-1.5 bg-neutral-900/50' : '',
              )}
              style={{ willChange: 'transform' }}
            >
              {/* Reply Context - Виправлена логіка */}
              {(() => {
                // Малюємо ТІЛЬКИ якщо є ID того, на що відповідаємо
                const rId = message.replyToId || (message as any).reply_to_id;
                if (!rId) return null;

                const reply = message.replyDetails || message.replyTo || (message as any).replyTo;
                if (!reply) return null;

                const senderName = reply.sender?.name || 
                                 (reply.senderId === currentUserId ? 'You' : otherParticipantName);

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
                      {senderName || 'Unknown'}
                    </span>
                    <span className="text-white/60 line-clamp-1 italic">
                      {reply.content || (reply.attachments?.length ? '📎 Attachment' : '...')}
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
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-all sm:break-words block w-full max-w-full overflow-hidden min-w-0">
                  <Linkify
                    options={{
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      className: 'text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors cursor-pointer',
                    }}
                  >
                    {message.content}
                  </Linkify>
                </div>
              )}

              {fileAttachments.length > 0 && (
                <div className="mt-2 space-y-1.5 w-full min-w-0">
                  {fileAttachments.map((file) => (
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
                          {file.metadata?.name || 'File'}
                        </p>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">
                          {file.metadata?.size ? `${(file.metadata.size / 1024 / 1024).toFixed(2)} MB` : 'Size unknown'}
                        </p>
                      </div>
                      <Download className="w-4 h-4 text-white/20 group-hover:text-white/50 shrink-0 transition-colors" />
                    </a>
                  ))}
                </div>
              )}

              <div className={cn(
                'flex items-center justify-end gap-1 mt-1.5 select-none w-full',
                isMe ? 'text-blue-100/50' : 'text-white/40',
              )}>
                <span className="text-[9px] font-medium">
                  {formatMessageDate(message.createdAt)}
                </span>
                {message.updated_at && 
                 new Date(message.updated_at).getTime() - new Date(message.createdAt).getTime() > 1000 && (
                  <span className="text-[9px] italic opacity-70">(відредаговано)</span>
                )}
                {isMe && (
                  <span className="text-[9px] font-bold">{message.isRead ? '••' : '•'}</span>
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => onReply(message)} className="gap-2">
            <Reply className="w-4 h-4" /> Reply
          </ContextMenuItem>
          {isMe && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => onEdit(message)}
                className="gap-2"
              >
                <Clock className="w-4 h-4" /> Edit Message
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => onDelete(message.id)}
                className="gap-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4" /> Delete Message
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </motion.div>
  );
}