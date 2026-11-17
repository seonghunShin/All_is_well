import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import HomePage from './pages/HomePage';
import FlightsPage from './pages/FlightsPage';
import PassengersPage from './pages/PassengersPage';
import SeatsPage from './pages/SeatsPage';
import PaymentPage from './pages/PaymentPage';
import BookingsPage, { BookingDetail } from './pages/BookingsPage';
import AuthPage from './pages/AuthPage';
import QueuePage from './pages/QueuePage';
import AdminPage from './pages/AdminPage';
import { DraftGuard } from './components/BookingUI';
import './App.css';
import './Flow.css';
function App() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <Routes>
      <Route
        path="/"
        element={<RootLayout />}
      >
        <Route
          index
          element={<HomePage />}
        />
        <Route
          path="flights"
          element={
            <DraftGuard>
              <FlightsPage />
            </DraftGuard>
          }
        />
        <Route
          path="passengers"
          element={
            <DraftGuard stage="passengers">
              <PassengersPage />
            </DraftGuard>
          }
        />
        <Route
          path="seats"
          element={
            <DraftGuard stage="seats">
              <SeatsPage />
            </DraftGuard>
          }
        />
        <Route
          path="payment"
          element={
            <DraftGuard stage="payment">
              <PaymentPage />
            </DraftGuard>
          }
        />
        <Route
          path="complete/:id"
          element={<BookingDetail complete />}
        />
        <Route
          path="bookings"
          element={<BookingsPage />}
        />
        <Route
          path="bookings/:id"
          element={<BookingDetail />}
        />
        <Route
          path="login"
          element={<AuthPage key="login" />}
        />
        <Route
          path="signup"
          element={
            <AuthPage
              key="signup"
              mode="signup"
            />
          }
        />
        <Route
          path="reset-password"
          element={
            <AuthPage
              key="reset"
              mode="reset"
            />
          }
        />
        <Route
          path="profile"
          element={
            <AuthPage
              key="profile"
              mode="profile"
            />
          }
        />
        <Route
          path="queue"
          element={<QueuePage />}
        />
        <Route
          path="admin"
          element={<AdminPage />}
        />
        <Route
          path="admin/flights"
          element={
            <AdminPage
              key="flights"
              mode="flights"
            />
          }
        />
        <Route
          path="admin/bookings"
          element={
            <AdminPage
              key="bookings"
              mode="bookings"
            />
          }
        />
        <Route
          path="*"
          element={
            <div className="container flowPage emptyPanel">
              <h1>페이지를 찾을 수 없어요.</h1>
              <a href="/">홈으로 돌아가기</a>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
export default App;
