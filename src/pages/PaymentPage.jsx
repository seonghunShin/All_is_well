import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBooking } from '../BookingContext';
import { BookingSteps, PageTitle, TripSummary } from '../components/BookingUI';
import { money, totalPrice } from '../utils/booking';
function PaymentPage() {
  const { draft, setDraft, setBookings } = useBooking();
  const navigate = useNavigate();
  const [method, setMethod] = useState('card');
  const [agreed, setAgreed] = useState(false);
  const [failure, setFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  function pay(event) {
    event.preventDefault();
    if (locked.current) return;
    if (Date.now() >= draft.holdUntil) {
      setError(
        '좌석 선택 시간이 만료되었어요. 좌석 선택 단계에서 다시 진행해 주세요.',
      );
      return;
    }
    locked.current = true;
    setBusy(true);
    setError('');
    timer.current = setTimeout(() => {
      if (failure || Date.now() >= draft.holdUntil) {
        setError(
          failure
            ? '결제 실패 예시입니다. 실패 체험 체크를 해제하고 다시 시도해 주세요.'
            : '선택 시간이 만료되었어요. 좌석을 다시 선택해 주세요.',
        );
        setBusy(false);
        locked.current = false;
        return;
      }
      const booking = {
        ...draft,
        id: `AW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        total: totalPrice(draft),
        status: '예약 완료',
        createdAt: new Date().toISOString(),
        method,
      };
      setBookings((prev) => [booking, ...prev]);
      setDraft((prev) => ({ ...prev, completedId: booking.id }));
      navigate(`/complete/${booking.id}`, { replace: true });
    }, 750);
  }
  return (
    <div className="container flowPage">
      <BookingSteps current={3} />
      <PageTitle title="마지막으로 확인해 주세요.">
        실제 결제가 발생하지 않는 체험 화면입니다. 카드 번호를 입력하지
        않습니다.
      </PageTitle>
      <div className="checkoutGrid">
        <form
          className="formStack"
          onSubmit={pay}
        >
          <section className="whitePanel">
            <h2>탑승객·좌석 확인</h2>
            {draft.passengers.map((person, index) => (
              <div
                className="reviewRow"
                key={index}
              >
                <strong>{person.name}</strong>
                <span>
                  가는 편 {draft.seats.outbound[index]}{' '}
                  {draft.inbound && `· 오는 편 ${draft.seats.inbound[index]}`}
                </span>
              </div>
            ))}
            <p className="muted">예약 연락처: {draft.contact.email}</p>
            <Link
              className="textLink"
              to="/seats"
            >
              좌석 수정
            </Link>
          </section>
          <section className="whitePanel">
            <h2>결제 수단</h2>
            <div className="paymentMethods">
              {[
                ['card', '신용·체크카드'],
                ['easy', '간편결제'],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="payment"
                    value={value}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                  />
                  {label} (체험)
                </label>
              ))}
            </div>
            <p className="notice">
              결제 버튼을 누르면 이 화면에서만 확인 가능한 예시 예약이
              생성됩니다.
            </p>
            <label className="checkboxLabel">
              <input
                type="checkbox"
                required
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              여정, 탑승객, 총금액을 확인했습니다.
            </label>
            <details>
              <summary>상태 화면 체험</summary>
              <label className="checkboxLabel">
                <input
                  type="checkbox"
                  checked={failure}
                  onChange={(event) => setFailure(event.target.checked)}
                />
                결제 실패 예시 보기
              </label>
            </details>
          </section>
          {error && (
            <div
              className="formError"
              role="alert"
            >
              {error} <Link to="/seats">좌석 선택으로 이동</Link>
            </div>
          )}
          <div className="pageActions">
            <Link
              className="secondary"
              to="/seats"
            >
              이전
            </Link>
            <button
              className="primary"
              disabled={!agreed || busy}
            >
              {busy
                ? '예시 결제 처리 중…'
                : `${money(totalPrice(draft), draft.quote?.currency)} 체험 결제`}
            </button>
          </div>
        </form>
        <TripSummary />
      </div>
    </div>
  );
}
export default PaymentPage;
