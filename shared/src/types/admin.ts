export type UserRole = 'customer' | 'admin' | 'owner';

export interface AdminMe {
  id: string;
  email: string;
  role: Exclude<UserRole, 'customer'>;
}

export interface AdminDashboardTopProduct {
  product_id: number;
  name_zh: string;
  image_url: string | null;
  total_quantity: number;
}

export interface AdminDashboardRecentOrder {
  id: number;
  order_number: string;
  customer_name: string;
  total: number;
  status: string;
  created_at: string;
}

export interface AdminDashboardStats {
  todayOrderCount: number;
  todayRevenue: number;
  pendingOrderCount: number;
  ordersByStatus: Record<string, number>;
  topProducts: AdminDashboardTopProduct[];
  recentOrders: AdminDashboardRecentOrder[];
}
