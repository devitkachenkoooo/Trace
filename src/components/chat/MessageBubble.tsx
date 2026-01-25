'use client';

import { Reply, Trash2, FileIcon, Download } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import { MessageMediaGrid } from './MessageMediaGrid';

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
    <div
      id={`message-${message.id}`}
      data-highlighted={isHighlighed}
      className={cn(
        'flex w-full mb-4 transition-colors duration-1000',
        isMe ? 'justify-end' : 'justify-start',
        isHighlighed ? 'bg-yellow-500/10 -mx-4 px-4 py-2 rounded-lg' : '',
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              'max-w-[70%] lg:max-w-[60%] flex flex-col relative',
              isMe ? 'items-end' : 'items-start',
            )}
          >
            {/* Reply Context Section */}
            {(message.replyDetails || message.replyTo) && (
              <button
                type="button"
                className={cn(
                  'mb-1 px-3 py-1 text-xs text-left rounded-xl bg-gray-700/50 border border-white/10 text-gray-400 flex flex-col cursor-pointer hover:bg-gray-700/70 transition-colors',
                  isMe ? 'mr-1 rounded-br-none self-end' : 'ml-1 rounded-bl-none self-start', // Align with bubble
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onScrollToMessage(message.replyToId || message.replyTo?.id || '');
                }}
              >
                <span className="font-semibold text-blue-400">
                  {message.replyDetails?.sender.name || 
                   (message.replyTo?.senderId === currentUserId ? 'You' : otherParticipantName) || 
                   'Unknown'}
                </span>
                <span className="truncate max-w-[200px]">
                  {message.replyDetails?.content || message.replyTo?.content}
                </span>
              </button>
            )}

            <div
              className={cn(
                'px-4 py-2 text-sm shadow-md break-words',
                isMe
                  ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                  : 'bg-white/10 text-gray-100 rounded-2xl rounded-tl-sm',
                imageAttachments.length > 0 && !message.content ? 'p-1 bg-transparent border-none' : ''
              )}
            >
              {imageAttachments.length > 0 && (
                <div className="mb-2">
                  <MessageMediaGrid images={imageAttachments} />
                </div>
              )}

              {message.content && <p>{message.content}</p>}

              {fileAttachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {fileAttachments.map((file) => (
                    <a
                      key={file.id}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg bg-black/20 hover:bg-black/30 transition-colors border border-white/5"
                    >
                      <FileIcon className="w-5 h-5 text-blue-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{file.metadata.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {(file.metadata.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Download className="w-4 h-4 text-gray-400" />
                    </a>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                <span className="text-[10px]">
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {isMe && (
                  <span className="text-[10px] ml-1">{message.isRead ? 'Read' : 'Sent'}</span>
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => onReply(message)} className="gap-2 cursor-pointer">
            <Reply className="w-4 h-4" />
            Reply
          </ContextMenuItem>
          {isMe && (
            <ContextMenuItem
              onClick={() => onDelete(message.id)}
              className="gap-2 text-red-500 focus:text-red-500 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Delete Message
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
