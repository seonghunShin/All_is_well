import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Ticket } from 'lucide-react';
import { useBooking } from '../BookingContext';
import { airportName, BookingSteps, PageTitle } from '../components/BookingUI';
import { money } from '../utils/booking';
export function BookingDetail({ complete = false }) {
  const { id } = useParams();
  const { bookings, setBookings } = useBooking();
  const [confirm, setConfirm] = useState(false);
  const booking = bookings.find((item) => item.id === id);
  if (!booking)
    return (
      <div className="container flowPage emptyPanel">
        <h1>예약을 찾을 수 없어요.</h1>
        <p>체험 예약은 새로고침하면 초기화됩니다.</p>
        <Link
          className="primary"
          to="/"
        >
          새 여행 검색
        </Link>
      </div>
    );
  return (
    <div className="container flowPage">
      {complete && <BookingSteps current={4} />}
      <div className="completionHeading">
        {complete && <CheckCircle2 size={54} />}
        <PageTitle
          eyebrow={complete ? 'READY FOR YOUR JOURNEY' : 'MY BOOKING'}
          title={complete ? '여행 준비가 끝났어요!' : '예약 상세'}
        >
          {complete
            ? '체험 예약이 완료되었습니다. 실제 항공권은 발급되지 않습니다.'
            : '선택한 여정과 예약 상태를 확인하세요.'}
        </PageTitle>
      </div>
      <section className="whitePanel ticketPanel">
        <div className="listHeading">
          <div>
            <small>예약 번호</small>
            <h2>{booking.id}</h2>
          </div>
          <span className="pill">{booking.status}</span>
        </div>
        <h2>
          {airportName(booking.search.from)} → {airportName(booking.search.to)}
        </h2>
        <p>
          {booking.search.depart} · {booking.outbound.airline}{' '}
          {booking.outbound.id} · {booking.outbound.time}
        </p>
        {booking.inbound && (
          <p>
            오는 편 {booking.search.returnDate} · {booking.inbound.airline}{' '}
            {booking.inbound.time}
          </p>
        )}
        <hr />
        {booking.passengers.map((person, index) => (
          <div
            className="reviewRow"
            key={index}
          >
            <strong>{person.name}</strong>
            <span>
              가는 편 {booking.seats.outbound[index]}{' '}
              {booking.inbound && `· 오는 편 ${booking.seats.inbound[index]}`}
            </span>
          </div>
        ))}
        <hr />
        <div className="reviewRow">
          <span>총 결제 금액 (체험)</span>
          <strong className="price">{money(booking.total)}</strong>
        </div>
        <p className="muted">
          {booking.status === '취소 완료'
            ? '예시 예약이 취소되었습니다. 실제 환불은 발생하지 않습니다.'
            : '체험 예약은 언제든 취소할 수 있으며 실제 환불은 발생하지 않습니다.'}
        </p>
        {booking.status !== '취소 완료' && !complete && (
          <>
            {confirm ? (
              <div className="notice">
                <p>이 체험 예약을 취소할까요?</p>
                <div className="toolbar">
                  <button
                    className="dangerButton"
                    onClick={() => {
                      setBookings((prev) =>
                        prev.map((item) =>
                          item.id === id
                            ? { ...item, status: '취소 완료' }
                            : item,
                        ),
                      );
                      setConfirm(false);
                    }}
                  >
                    예약 취소 확정
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setConfirm(false)}
                  >
                    유지하기
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="textLink"
                onClick={() => setConfirm(true)}
              >
                예약 취소
              </button>
            )}
          </>
        )}
      </section>
      <div className="centerActions">
        <Link
          className="primary"
          to="/bookings"
        >
          예약내역 보기
        </Link>
        <Link
          className="secondary"
          to="/"
        >
          새 여행 검색
        </Link>
      </div>
    </div>
  );
}
function BookingsPage() {
  const { bookings } = useBooking();
  const [filter, setFilter] = useState('all');
  const visible = bookings.filter(
    (item) => filter === 'all' || item.status === filter,
  );
  return (
    <div className="container flowPage">
      <PageTitle
        eyebrow="MY JOURNEYS"
        title="나의 예약내역"
      >
        이 브라우저에서 생성한 체험 예약입니다. 새로고침하면 내역이
        초기화됩니다.
      </PageTitle>
      <div className="toolbar">
        <label>
          예약 상태{' '}
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">전체</option>
            <option>예약 완료</option>
            <option>취소 완료</option>
          </select>
        </label>
        <Link
          className="textLink"
          to="/profile"
        >
          회원정보 수정
        </Link>
      </div>
      {visible.length ? (
        <div className="bookingList">
          {visible.map((booking) => (
            <Link
              className="whitePanel bookingItem"
              key={booking.id}
              to={`/bookings/${booking.id}`}
            >
              <Ticket />
              <div>
                <span className="pill">{booking.status}</span>
                <h2>
                  {airportName(booking.search.from)} →{' '}
                  {airportName(booking.search.to)}
                </h2>
                <p>
                  {booking.search.depart} · 성인 {booking.search.passengers}명 ·{' '}
                  {booking.id}
                </p>
              </div>
              <strong>{money(booking.total)} →</strong>
            </Link>
          ))}
        </div>
      ) : (
        <div className="emptyPanel">
          <Ticket size={42} />
          <h2>표시할 예약이 없어요.</h2>
          <p>여행지를 고르고 첫 여행을 준비해 보세요.</p>
          <Link
            className="primary"
            to="/"
          >
            항공권 검색
          </Link>
        </div>
      )}
    </div>
  );
}
export default BookingsPage;
