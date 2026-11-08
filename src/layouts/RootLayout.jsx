import { Link, NavLink, Outlet } from 'react-router-dom';
import { Plane } from 'lucide-react';
import { useBooking } from '../BookingContext';
function RootLayout() {
  const { user } = useBooking();
  return (
    <>
      <a
        className="skipLink"
        href="#main"
      >
        본문으로 이동
      </a>
      <header className="header">
        <div className="container headerInner">
          <Link
            className="brand"
            to="/"
            aria-label="All is well 홈"
          >
            <span className="brandIcon">
              <Plane size={24} />
            </span>
            all is well<span className="brandDot">.</span>
          </Link>
          <nav aria-label="주 메뉴">
            <NavLink
              to="/"
              end
            >
              항공권
            </NavLink>
            <NavLink to="/bookings">예약내역</NavLink>
            <NavLink to="/queue">대기열 체험</NavLink>
          </nav>
          <Link
            className="accountLink"
            to={user ? '/profile' : '/login'}
          >
            {user ? `${user.name} 님` : '로그인 / 회원가입'}
          </Link>
        </div>
      </header>
      <div className="demoBanner">
        학습용 체험 서비스 · 실제 항공권 구매·결제는 발생하지 않습니다. ·
        새로고침 시 초기화
      </div>
      <main
        id="main"
        tabIndex={-1}
      >
        <Outlet />
      </main>
      <footer className="container footer">
        <Link
          className="brand"
          to="/"
        >
          all is well.
        </Link>
        <p>누구나 편안하게, 어디로든 자유롭게.</p>
        <Link
          className="textLink"
          to="/admin"
        >
          관리자 화면 체험 ↗
        </Link>
        <span>
          © 2026 All is well · 캡스톤 프로젝트
          <br />
          React 프론트엔드 데모
        </span>
      </footer>
    </>
  );
}
export default RootLayout;
