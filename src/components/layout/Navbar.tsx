'use client';

import Image from 'next/image';
import { useState } from 'react';
import { SignInButton, SignOutButton } from '../auth/auth-buttons';
import Logo from '../ui/Logo';

interface NavbarProps {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export default function Navbar({ user }: NavbarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/50 backdrop-blur-md">
      {/* Left: Logo only */}
      <div className="flex items-center">
        <Logo />
      </div>

      {/* Right: Auth */}
      <div className="flex items-center gap-4">
        {user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none"
            >
              <span className="hidden sm:block text-sm font-medium text-gray-200">{user.name}</span>
              <div className="relative w-9 h-9 rounded-full overflow-hidden border border-white/20">
                <Image
                  src={user.image || '/default-avatar.png'}
                  alt="avatar"
                  fill
                  className="object-cover"
                />
              </div>
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-lg py-1 z-20">
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-xs text-gray-400">Signed in as</p>
                  <p className="text-sm font-medium text-white truncate">{user.email}</p>
                </div>
                <SignOutButton />
              </div>
            )}
          </div>
        ) : (
          <SignInButton />
        )}
      </div>
    </nav>
  );
}
