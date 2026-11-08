import { Link, Navigate } from 'react-router-dom';
import { airports } from '../data/destinations';
import { useBooking } from '../BookingContext';
import { money, totalPrice } from '../utils/booking';
export const airportName = (code) =>
  airports.find((item) => item.code === code)?.name || code;
export function PageTitle({ eyebrow = 'ALL IS WELL', title, children }) {
  return (
    <div className="pageTitle">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
export function BookingSteps({ current }) {
  return (
    <ol
      className="bookingSteps"
      aria-label="예약 진행 단계"
    >
      {['항공편 선택', '탑승객 정보', '좌석 선택', '결제', '완료'].map(
        (step, index) => (
          <li
            key={step}
            className={
              index === current ? 'current' : index < current ? 'done' : ''
            }
            aria-current={index === current ? 'step' : undefined}
          >
            <span>{index < current ? '✓' : index + 1}</span>
            {step}
          </li>
        ),
      )}
    </ol>
  );
}
export function DraftGuard({ stage = 'search', children }) {
  const { draft } = useBooking();
  if (draft?.completedId)
    return (
      <Navigate
        to={`/complete/${draft.completedId}`}
        replace
      />
    );
  if (!draft)
    return (
      <Navigate
        to="/"
        replace
      />
    );
  if (
    stage !== 'search' &&
    (!draft.outbound || (draft.search.trip === 'round' && !draft.inbound))
  )
    return (
      <Navigate
        to="/flights"
        replace
      />
    );
  if (['seats', 'payment'].includes(stage) && !draft.passengers?.length)
    return (
      <Navigate
        to="/passengers"
        replace
      />
    );
  if (
    stage === 'payment' &&
    (!draft.seats?.outbound ||
      draft.seats.outbound.length !== Number(draft.search.passengers) ||
      (draft.inbound &&
        draft.seats.inbound?.length !== Number(draft.search.passengers)))
  )
    return (
      <Navigate
        to="/seats"
        replace
      />
    );
  return children;
}
export function TripSummary() {
  const { draft } = useBooking();
  if (!draft) return null;
  return (
    <aside className="summaryPanel">
      <span className="eyebrow">YOUR JOURNEY</span>
      <h2>나의 여행</h2>
      <h3>
        {airportName(draft.search.from)} <span>→</span>{' '}
        {airportName(draft.search.to)}
      </h3>
      <p>
        {draft.search.trip === 'round' ? '왕복' : '편도'} · 성인{' '}
        {draft.search.passengers}명 · {draft.search.cabin}
      </p>
      <hr />
      <p>
        가는 날 <strong>{draft.search.depart}</strong>
      </p>
      {draft.outbound && (
        <p>
          {draft.outbound.airline} · {draft.outbound.time}
          {draft.outbound.quote &&
            ` · ${money(draft.outbound.quote.amount, draft.outbound.quote.currency)}`}
        </p>
      )}
      {draft.inbound && (
        <>
          <p>
            오는 날 <strong>{draft.search.returnDate}</strong>
          </p>
          <p>
            {draft.inbound.airline} · {draft.inbound.time}
            {draft.inbound.quote &&
              ` · ${money(draft.inbound.quote.amount, draft.inbound.quote.currency)}`}
          </p>
        </>
      )}
      <hr />
      <p>
        총 예상 금액{' '}
        <strong className="price">
          {money(totalPrice(draft), draft.quote?.currency)}
        </strong>
      </p>
      <small>
        {draft.quote ? '조회 당시 운임 · 모의 예약' : '세금 포함 · 예시 운임'}
        <br />
        선택 좌석 추가 요금 없음
      </small>
      <Link
        className="textLink"
        to="/flights"
      >
        항공편 다시 선택
      </Link>
    </aside>
  );
}
