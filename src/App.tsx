import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from '@/components/Layout/PublicLayout';
import { AdminLayout } from '@/components/Layout/AdminLayout';
import Home from '@/pages/public/Home';
import EventDetail from '@/pages/public/EventDetail';
import Checkout from '@/pages/public/Checkout';
import OrderStatus from '@/pages/public/OrderStatus';
import Voucher from '@/pages/public/Voucher';
import NotFound from '@/pages/NotFound';
import AdminLogin from '@/pages/admin/Login';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminEvents from '@/pages/admin/Events';
import EventEditor from '@/pages/admin/EventEditor';
import AdminOrders from '@/pages/admin/Orders';
import AdminCheckin from '@/pages/admin/Checkin';
import AdminContagem from '@/pages/admin/Contagem';
import AdminOperators from '@/pages/admin/Operators';
import AdminPdv from '@/pages/admin/Pdv';
import CustomerSignup from '@/pages/customer/Signup';
import CustomerLogin from '@/pages/customer/Login';
import CustomerAccount from '@/pages/customer/Account';

export default function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
      <Route path="/evento/:slug" element={<PublicLayout><EventDetail /></PublicLayout>} />
      <Route path="/checkout" element={<PublicLayout><Checkout /></PublicLayout>} />
      <Route path="/pedido/:orderId" element={<PublicLayout><OrderStatus /></PublicLayout>} />
      <Route path="/voucher/:hash" element={<PublicLayout><Voucher /></PublicLayout>} />

      {/* Conta de cliente */}
      <Route path="/conta/cadastro" element={<CustomerSignup />} />
      <Route path="/conta/login" element={<CustomerLogin />} />
      <Route path="/conta" element={<PublicLayout><CustomerAccount /></PublicLayout>} />

      {/* Admin */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout requireAdmin><AdminDashboard /></AdminLayout>} />
      <Route path="/admin/eventos" element={<AdminLayout requireAdmin><AdminEvents /></AdminLayout>} />
      <Route path="/admin/eventos/:id" element={<AdminLayout requireAdmin><EventEditor /></AdminLayout>} />
      <Route path="/admin/pedidos" element={<AdminLayout requireAdmin><AdminOrders /></AdminLayout>} />
      <Route path="/admin/operadores" element={<AdminLayout requireAdmin><AdminOperators /></AdminLayout>} />
      <Route path="/admin/checkin" element={<AdminLayout><AdminCheckin /></AdminLayout>} />
      <Route path="/admin/contagem" element={<AdminLayout><AdminContagem /></AdminLayout>} />
      <Route path="/admin/pdv" element={<AdminLayout><AdminPdv /></AdminLayout>} />

      <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
    </Routes>
  );
}
