import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from '@/components/Layout/PublicLayout';
import Home from '@/pages/public/Home';
import EventDetail from '@/pages/public/EventDetail';
import Checkout from '@/pages/public/Checkout';
import OrderStatus from '@/pages/public/OrderStatus';
import Voucher from '@/pages/public/Voucher';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicLayout>
            <Home />
          </PublicLayout>
        }
      />
      <Route
        path="/evento/:slug"
        element={
          <PublicLayout>
            <EventDetail />
          </PublicLayout>
        }
      />
      <Route
        path="/checkout"
        element={
          <PublicLayout>
            <Checkout />
          </PublicLayout>
        }
      />
      <Route
        path="/pedido/:orderId"
        element={
          <PublicLayout>
            <OrderStatus />
          </PublicLayout>
        }
      />
      <Route
        path="/voucher/:hash"
        element={
          <PublicLayout>
            <Voucher />
          </PublicLayout>
        }
      />
      <Route
        path="*"
        element={
          <PublicLayout>
            <NotFound />
          </PublicLayout>
        }
      />
    </Routes>
  );
}
