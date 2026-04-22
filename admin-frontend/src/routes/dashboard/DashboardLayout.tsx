import { Outlet } from 'react-router-dom';
import { AdminAuthGuard } from '@/lib/admin-auth-guard';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default function DashboardLayout() {
  return (
    <AdminAuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto bg-bg-body px-8 py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminAuthGuard>
  );
}
