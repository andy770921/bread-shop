import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import Login from '@/routes/Login';
import DashboardLayout from '@/routes/dashboard/DashboardLayout';
import DashboardIndex from '@/routes/dashboard/DashboardIndex';
import ProductList from '@/routes/dashboard/products/ProductList';
import ProductNew from '@/routes/dashboard/products/ProductNew';
import ProductEdit from '@/routes/dashboard/products/ProductEdit';
import ContentEditor from '@/routes/dashboard/content/ContentEditor';
import ContentBlocksPage from '@/routes/dashboard/content-blocks/ContentBlocksPage';
import OrderList from '@/routes/dashboard/orders/OrderList';
import OrderDetail from '@/routes/dashboard/orders/OrderDetail';
import FeatureFlags from '@/routes/dashboard/feature-flags/FeatureFlags';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardIndex />} />
          <Route path="products" element={<ProductList />} />
          <Route path="products/new" element={<ProductNew />} />
          <Route path="products/:id" element={<ProductEdit />} />
          <Route path="content" element={<ContentEditor />} />
          <Route path="content-blocks" element={<ContentBlocksPage />} />
          <Route path="orders" element={<OrderList />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="feature-flags" element={<FeatureFlags />} />
        </Route>
      </Routes>
      <Toaster position="top-right" />
    </>
  );
}
