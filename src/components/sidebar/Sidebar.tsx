import { createClient } from '@/lib/supabase/server';
import SidebarShell from './SidebarShell';

export default async function Sidebar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  return <SidebarShell />;
}
