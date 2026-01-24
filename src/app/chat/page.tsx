'use client';

import { MessageSquare } from 'lucide-react';

export default function ChatEmptyPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] text-center px-4 bg-black/40">
      <div className="w-24 h-24 bg-white/[0.03] rounded-3xl flex items-center justify-center mb-8 border border-white/10 shadow-2xl">
        <MessageSquare className="w-12 h-12 text-gray-500/50" />
      </div>
      <h2 className="text-3xl font-bold text-white/80 mb-3 tracking-tight">Trace Messaging</h2>
      <p className="text-gray-500 max-w-[280px] mx-auto text-sm leading-relaxed">
        Select a chat from the sidebar to start messaging with your contacts.
      </p>
    </div>
  );
}
