'use client';

import { usePresenceStore } from '@/store/usePresenceStore';
import { cn } from '@/lib/utils';
import { memo } from 'react';

interface PresenceIndicatorProps {
  userId: string;
  className?: string;
  showOffline?: boolean;
}

function PresenceIndicatorBase({ userId, className, showOffline = false }: PresenceIndicatorProps) {
  // Select ONLY the boolean value to prevent re-renders when other users change status
  const isOnline = usePresenceStore((state) => state.onlineUsers.has(userId));

  if (!isOnline && !showOffline) return null;

  return (
    <div 
      className={cn(
        "rounded-full border-2 border-black", 
        isOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-gray-500",
        className
      )} 
    />
  );
}

export const PresenceIndicator = memo(PresenceIndicatorBase);
