import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plane, ArrowRight } from 'lucide-react';
import { useBooking } from '../BookingContext';
import { airportName, BookingSteps, PageTitle } from '../components/BookingUI';
import { flightForRoute } from '../data/flights';
import { money } from '../utils/booking';
function FlightsPage() {
  const { draft, setDraft, flights } = useBooking();
  const navigate = useNavigate();
  const [leg, setLeg] = useState('outbound');
  const [direct, setDirect] = useState(draft.search.direct);
  const [airline, setAirline] = useState('all');
  const [sort, setSort] = useState('price');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const list = flights
    .filter(
      (item) =>
        item.available &&
        (!direct || item.direct) &&
        (airline === 'all' || item.airline === airline),
    )
    .map((item) => flightForRoute(item, draft.search))
    .sort((a, b) =>
      sort === 'price' ? a.price - b.price : a.time.localeCompare(b.time),
    );
  function selectFlight(flight) {
    if (leg === 'outbound') {
      setDraft((prev) => ({
        ...prev,
        outbound: flight,
        inbound: null,
        seats: null,
        holdUntil: null,
      }));
      if (draft.search.trip === 'round') {
        setLeg('inbound');
        setSelected(null);
        window.scrollTo(0, 0);
        return;
      }
    } else
      setDraft((prev) => ({
        ...prev,
        inbound: flight,
        seats: null,
        holdUntil: null,
      }));
    navigate('/passengers');
  }
  function retry() {
    setLoading(true);
    setFailed(false);
    window.setTimeout(() => setLoading(false), 650);
  }
  return (
    <div className="container flowPage">
      <BookingSteps current={0} />
      <PageTitle
        eyebrow="CHOOSE YOUR FLIGHT"
        title={
          leg === 'outbound'
            ? '가는 편을 선택해 주세요.'
            : '오는 편을 선택해 주세요.'
        }
      >
        {airportName(draft.search[leg === 'outbound' ? 'from' : 'to'])} →{' '}
        {airportName(draft.search[leg === 'outbound' ? 'to' : 'from'])} ·{' '}
        {leg === 'outbound' ? draft.search.depart : draft.search.returnDate}
      </PageTitle>
      <div className="toolbar">
        <Link
          className="secondary"
          to="/"
        >
          검색 조건 변경
        </Link>
        {leg === 'inbound' && (
          <button
            className="secondary"
            onClick={() => setLeg('outbound')}
          >
            가는 편 다시 선택
          </button>
        )}
        <span className="pill">전 항공편·시간·운임은 예시입니다</span>
      </div>
      <div className="flowGrid">
        <aside className="filterPanel">
          <h2>원하는 조건</h2>
          <label className="checkboxLabel">
            <input
              type="checkbox"
              checked={direct}
              onChange={(event) => setDirect(event.target.checked)}
            />
            직항만 보기
          </label>
          <label className="stackLabel">
            항공사
            <select
              value={airline}
              onChange={(event) => setAirline(event.target.value)}
            >
              <option value="all">모든 항공사</option>
              <option>올웰 항공</option>
              <option>하늘 항공</option>
            </select>
          </label>
          <button
            className="textLink"
            onClick={() => {
              setDirect(false);
              setAirline('all');
            }}
          >
            필터 초기화
          </button>
          <details>
            <summary>상태 화면 체험</summary>
            <button
              className="secondary"
              onClick={() => setFailed(true)}
            >
              조회 실패 보기
            </button>
          </details>
        </aside>
        <section>
          <div className="listHeading">
            <strong>{list.length}개의 예시 항공편</strong>
            <label>
              정렬{' '}
              <select
                aria-label="항공편 정렬"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="price">낮은 가격순</option>
                <option value="time">빠른 출발순</option>
              </select>
            </label>
          </div>
          {loading ? (
            <div
              className="emptyPanel"
              role="status"
            >
              항공편을 불러오는 중이에요…
            </div>
          ) : failed ? (
            <div
              className="emptyPanel"
              role="alert"
            >
              <h2>항공편을 불러오지 못했어요.</h2>
              <p>체험용 오류 상태입니다. 다시 시도해 주세요.</p>
              <button
                className="primary"
                onClick={retry}
              >
                다시 시도
              </button>
            </div>
          ) : !list.length ? (
            <div className="emptyPanel">
              <h2>조건에 맞는 항공편이 없어요.</h2>
              <p>필터를 변경하거나 다른 날짜로 검색해 주세요.</p>
            </div>
          ) : (
            list.map((flight) => (
              <article
                className="flightCard"
                key={flight.id}
              >
                <div className="flightCardTop">
                  <span className="airlineIcon">
                    <Plane size={21} />
                  </span>
                  <strong>{flight.airline}</strong>
                  <small>{flight.id} · 예시 항공편</small>
                </div>
                <div className="flightCardBody">
                  <div>
                    <strong className="flightTime">{flight.time}</strong>
                    <p>{draft.search[leg === 'outbound' ? 'from' : 'to']}</p>
                  </div>
                  <div className="flightLine">
                    <small>{flight.duration}</small>
                    <div>
                      ──────── <Plane size={15} />
                    </div>
                    <small>{flight.direct ? '직항' : '1회 경유'}</small>
                  </div>
                  <div>
                    <strong className="flightTime">{flight.arrival}</strong>
                    <p>{draft.search[leg === 'outbound' ? 'to' : 'from']}</p>
                  </div>
                  <div className="flightPrice">
                    <small>성인 1명 · 일반석 기준</small>
                    <strong>{money(flight.price)}</strong>
                    <button
                      className="primary"
                      onClick={() =>
                        setSelected(selected === flight.id ? null : flight.id)
                      }
                    >
                      운임·상세 보기 <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
                {selected === flight.id && (
                  <div className="fareDetails">
                    <h3>예약 전 확인해 주세요</h3>
                    <p>
                      기내 수하물 10kg · 위탁 수하물 15kg · 출발 24시간 전까지
                      무료 취소
                    </p>
                    <p>
                      본 조건은 화면 체험을 위한 예시입니다. 국제선 시간은 동일
                      기준시각 예시이며 실제 운항표가 아닙니다.
                    </p>
                    <button
                      className="primary"
                      onClick={() => selectFlight(flight)}
                    >
                      {leg === 'outbound' && draft.search.trip === 'round'
                        ? '선택하고 오는 편 찾기'
                        : '선택하고 탑승객 입력'}
                    </button>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
export default FlightsPage;
