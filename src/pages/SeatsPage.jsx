import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBooking } from '../BookingContext';
import { BookingSteps, PageTitle, TripSummary } from '../components/BookingUI';
import { occupiedSeats } from '../data/flights';
function SeatsPage() {
  const { draft, setDraft } = useBooking();
  const navigate = useNavigate();
  const [leg, setLeg] = useState('outbound');
  const [seats, setSeats] = useState(
    draft.seats || { outbound: [], inbound: [] },
  );
  const [until, setUntil] = useState(draft.holdUntil || Date.now() + 600000);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    setDraft((prev) => ({ ...prev, seats, holdUntil: until }));
  }, [seats, until, setDraft]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((until - now) / 1000));
  const legs = draft.inbound ? ['outbound', 'inbound'] : ['outbound'];
  function select(seat) {
    if (!seconds) return;
    setError('');
    const current = seats[leg];
    if (current.includes(seat))
      return setSeats((prev) => ({
        ...prev,
        [leg]: current.filter((item) => item !== seat),
      }));
    if (current.length >= Number(draft.search.passengers)) {
      setError('인원수만큼 선택했어요. 기존 좌석을 해제하면 바꿀 수 있어요.');
      return;
    }
    setSeats((prev) => ({ ...prev, [leg]: [...current, seat] }));
  }
  function next() {
    if (!seconds) {
      setError('선택 시간이 만료되었어요. 좌석을 다시 선택해 주세요.');
      return;
    }
    if (
      legs.some((key) => seats[key].length !== Number(draft.search.passengers))
    ) {
      setError('가는 편과 오는 편 모두 탑승 인원수만큼 좌석을 선택해 주세요.');
      return;
    }
    if (conflict) {
      setConflict(false);
      setSeats((prev) => ({ ...prev, [leg]: prev[leg].slice(0, -1) }));
      setError(
        '좌석 선점 실패 예시: 다른 사용자가 먼저 선택했어요. 좌석을 다시 선택해 주세요.',
      );
      return;
    }
    setDraft((prev) => ({ ...prev, seats, holdUntil: until }));
    navigate('/payment');
  }
  return (
    <div className="container flowPage">
      <BookingSteps current={2} />
      <PageTitle title="편안한 자리를 골라보세요.">
        좌석은 선택 순서대로 탑승객에게 배정됩니다. 왕복은 각 구간의 좌석을
        선택해 주세요.
      </PageTitle>
      <div className="checkoutGrid">
        <div className="formStack">
          <div
            className="notice"
            role="status"
          >
            체험용 선택 시간 {Math.floor(seconds / 60)}:
            {String(seconds % 60).padStart(2, '0')} · 서버 좌석 확보와 연결되지
            않은 타이머입니다.
          </div>
          {!seconds && (
            <div
              className="formError"
              role="alert"
            >
              시간이 만료되었어요.{' '}
              <button
                onClick={() => {
                  setSeats({ outbound: [], inbound: [] });
                  setUntil(Date.now() + 600000);
                  setError('');
                }}
              >
                좌석 다시 선택
              </button>
            </div>
          )}
          <section className="whitePanel">
            <div className="segmented">
              {legs.map((key) => (
                <button
                  key={key}
                  className={leg === key ? 'selected' : ''}
                  onClick={() => setLeg(key)}
                >
                  {key === 'outbound' ? '가는 편' : '오는 편'} ·{' '}
                  {seats[key].length}/{draft.search.passengers}
                </button>
              ))}
            </div>
            <div className="seatLegend">
              <span>□ 선택 가능</span>
              <span className="teal">■ 선택한 좌석</span>
              <span>▧ 예약 완료</span>
            </div>
            <div className="planeCabin">
              <p>항공기 앞쪽 ↑</p>
              <div className="seatMap">
                {Array.from({ length: 8 }, (_, row) => (
                  <div
                    className="seatRow"
                    key={row}
                  >
                    <small>{row + 1}</small>
                    {['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => {
                      const seat = `${row + 1}${letter}`;
                      const taken = occupiedSeats.includes(seat);
                      return (
                        <button
                          type="button"
                          key={seat}
                          disabled={taken || !seconds}
                          aria-label={`${seat}${taken ? ' 예약 완료' : ''}`}
                          aria-pressed={seats[leg].includes(seat)}
                          className={`seat ${letter === 'D' ? 'aisle' : ''} ${seats[leg].includes(seat) ? 'selected' : ''}`}
                          onClick={() => select(seat)}
                        >
                          {seat}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <ul className="assignmentList">
              {draft.passengers.map((person, i) => (
                <li key={i}>
                  {person.name} <strong>{seats[leg][i] || '선택 전'}</strong>
                </li>
              ))}
            </ul>
            <details>
              <summary>상태 화면 체험</summary>
              <label className="checkboxLabel">
                <input
                  type="checkbox"
                  checked={conflict}
                  onChange={(event) => setConflict(event.target.checked)}
                />
                다음 단계에서 선점 실패 예시 보기
              </label>
              <button
                className="secondary"
                onClick={() => setUntil(Date.now() - 1000)}
              >
                선택 시간 만료 체험
              </button>
            </details>
          </section>
          {error && (
            <p
              className="formError"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="pageActions">
            <Link
              className="secondary"
              to="/passengers"
            >
              이전
            </Link>
            <button
              className="primary"
              onClick={next}
            >
              다음 · 예약 확인 및 결제
            </button>
          </div>
        </div>
        <TripSummary />
      </div>
    </div>
  );
}
export default SeatsPage;
