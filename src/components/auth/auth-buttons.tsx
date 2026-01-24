import { LogIn, LogOut } from "lucide-react";
import { handleSignIn, handleSignOut } from "@/actions/auth";

export function SignInButton() {
  return (
    <form action={handleSignIn}>
      <button type="submit" className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-200 transition-colors">
        <LogIn className="w-4 h-4" />
        Log in
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={handleSignOut}>
      <button type="submit" className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5 flex items-center gap-2">
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    </form>
  );
}
