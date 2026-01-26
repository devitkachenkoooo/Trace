import { SupabaseAuthProvider } from '../SupabaseAuthProvider';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SupabaseAuthProvider>
      {children}
    </SupabaseAuthProvider>
  );
}
