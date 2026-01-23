'use client';

import { MessageSquare, Settings, User, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { icon: MessageSquare, label: 'Chats', href: '/' },
  { icon: Users, label: 'Contacts', href: '/contacts' },
  { icon: User, label: 'Profile', href: '/profile' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-20 md:w-64 border-r border-white/10 bg-black/50 backdrop-blur-md z-40 hidden sm:flex flex-col py-6">
      <div className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="hidden md:block font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
