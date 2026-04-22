import { Injectable } from '@nestjs/common';
import type { AdminDashboardStats } from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class DashboardAdminService {
  constructor(private supabase: SupabaseService) {}

  async getStats(): Promise<AdminDashboardStats> {
    const supabase = this.supabase.getClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [ordersToday, allOrders, topProducts, recentOrders] = await Promise.all([
      supabase.from('orders').select('id, total').gte('created_at', todayISO),
      supabase.from('orders').select('status'),
      supabase.rpc('get_top_selling_products', { limit_count: 5 }),
      supabase
        .from('orders')
        .select('id, order_number, customer_name, total, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const todayRevenue = (ordersToday.data ?? []).reduce(
      (sum: number, o: { total: number | null }) => sum + (o.total ?? 0),
      0,
    );
    const todayOrderCount = ordersToday.data?.length ?? 0;

    const statusCounts: Record<string, number> = {};
    for (const o of (allOrders.data ?? []) as { status: string }[]) {
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
    }

    return {
      todayOrderCount,
      todayRevenue,
      pendingOrderCount: statusCounts['pending'] ?? 0,
      ordersByStatus: statusCounts,
      topProducts: (topProducts.data ?? []) as AdminDashboardStats['topProducts'],
      recentOrders: (recentOrders.data ?? []) as AdminDashboardStats['recentOrders'],
    };
  }
}
