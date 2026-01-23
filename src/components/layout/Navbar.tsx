'use client';

import { LogIn, LogOut, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

export default function Navbar() {
  const { user, isAuthenticated, loginWithGoogle, logout } = useAuthStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/50 backdrop-blur-md">
      {/* Left: Logo & Search */}
      <div className="flex items-center gap-8">
        <Link href="/" className="text-xl font-bold tracking-tight text-white">
          Trace
        </Link>
        <div className="relative hidden md:block group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-white transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            aria-label="Search users"
            className="w-64 pl-10 pr-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white placeholder-gray-400 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-all"
          />
        </div>
      </div>

      {/* Right: Auth */}
      <div className="flex items-center gap-4">
        {isAuthenticated && user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none appearance-none"
              aria-expanded={isDropdownOpen}
              aria-haspopup="true"
            >
              <span className="hidden sm:block text-sm font-medium text-gray-200">{user.name}</span>
              <div className="relative w-9 h-9 rounded-full overflow-hidden border border-white/20">
                <Image
                  src={user.avatar}
                  alt={user.name}
                  fill
                  className="object-cover"
                  sizes="36px"
                />
              </div>
            </button>

            {/* Dropdown */}
            {isDropdownOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default w-full h-full bg-transparent border-none p-0"
                  onClick={() => setIsDropdownOpen(false)}
                  aria-label="Close menu"
                  tabIndex={-1}
                />
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-lg py-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-xs text-gray-400">Signed in as</p>
                    <p className="text-sm font-medium text-white truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={loginWithGoogle}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Log in
          </button>
        )}
      </div>
    </nav>
  );
}
