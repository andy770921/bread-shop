import { Outlet } from 'react-router-dom';
import { AdminAuthGuard } from '@/lib/admin-auth-guard';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default function DashboardLayout() {
  return (
    <AdminAuthGuard>
      <div className="flex min-h-screen flex-col md:h-screen md:flex-row md:overflow-hidden">
        <Sidebar />
        <div className="flex min-h-0 flex-1 flex-col md:overflow-hidden">
          <Topbar />
          <main className="flex-1 bg-bg-body px-4 py-4 md:overflow-y-auto md:px-8 md:py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminAuthGuard>
  );
}
