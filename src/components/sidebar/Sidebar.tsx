import { auth } from '@/auth';
import SidebarShell from './SidebarShell';

export default async function Sidebar() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId || !session?.user) return null;

  return (
    <SidebarShell />
  );
}
