import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBooking } from '../BookingContext';
import { BookingSteps, PageTitle, TripSummary } from '../components/BookingUI';
import { cabinLayouts } from '../data/flights';
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
  const cabin = draft.search.cabin;
  const layout = cabinLayouts[cabin];
  const columns = layout.groups.flatMap((group, index) =>
    [...group].map((letter, position) => ({
      letter,
      aisle: index > 0 && position === 0,
    })),
  );
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
      <PageTitle title={`${cabin} 좌석을 골라보세요.`}>
        검색에서 선택한 등급의 모의 좌석입니다. 왕복은 가는 편과 오는 편의
        좌석을 각각 선택해 주세요.
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
            <ul
              className="seatCabinGrades"
              aria-label="좌석 등급"
            >
              {Object.keys(cabinLayouts).map((name) => (
                <li
                  key={name}
                  aria-current={name === cabin ? 'true' : undefined}
                >
                  {name}
                </li>
              ))}
            </ul>
            <Link
              className="textLink"
              to="/"
            >
              검색에서 좌석 등급 변경
            </Link>
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
              <div
                className="seatMap"
                role="group"
                aria-label={`${cabin} 모의 좌석`}
              >
                {Array.from({ length: layout.rowCount }, (_, index) => {
                  const row = layout.firstRow + index;
                  return (
                    <div
                      className="seatRow"
                      key={row}
                    >
                      <small>{row}</small>
                      {columns.map(({ letter, aisle }) => {
                        const seat = `${row}${letter}`;
                        const taken = layout.occupied.includes(seat);
                        const selected = seats[leg].includes(seat);
                        return (
                          <button
                            type="button"
                            key={seat}
                            disabled={taken || !seconds}
                            aria-label={`${seat}${taken ? ' 예약 완료' : ''}`}
                            aria-pressed={selected}
                            className={`seat ${aisle ? 'aisle' : ''} ${selected ? 'selected' : ''}`}
                            onClick={() => select(seat)}
                          >
                            {seat}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
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
