'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReplyPreviewProps {
  replyingTo: {
    id: string;
    sender: string;
    content: string;
  } | null;
  onCancel: () => void;
}

export function ReplyPreview({ replyingTo, onCancel }: ReplyPreviewProps) {
  if (!replyingTo) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50 border-t border-white/10 text-sm">
      <div className="flex flex-col overflow-hidden">
        <span className="text-blue-400 font-medium">Replying to {replyingTo.sender}</span>
        <span className="text-gray-400 truncate max-w-md">{replyingTo.content}</span>
      </div>
      <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8 hover:bg-white/10">
        <X className="w-4 h-4 text-gray-400" />
      </Button>
    </div>
  );
}
