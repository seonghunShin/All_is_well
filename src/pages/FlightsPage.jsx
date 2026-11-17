import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plane, ArrowRight } from 'lucide-react';
import { useBooking } from '../BookingContext';
import { airportName, BookingSteps, PageTitle } from '../components/BookingUI';
import FlightDetails from '../components/FlightDetails';
import { isDomesticRoute } from '../data/destinations';
import { flightForRoute } from '../data/flights';
import { combineQuotes, money } from '../utils/booking';
import { canReturnAfterArrival, normalizeItineraries } from '../utils/ignav';

function FlightTimes({ flight, from, to }) {
  const overseasStop =
    flight.segments?.length > 1 &&
    isDomesticRoute({ from, to }) &&
    !isDomesticRoute(flight);
  return (
    <>
      <div>
        <strong className="flightTime">{flight.time}</strong>
        <p>{flight.from || from}</p>
      </div>
      <div className="flightLine">
        <small>{flight.duration}</small>
        <div>
          ──────── <Plane size={15} />
        </div>
        <small>
          {flight.direct
            ? '직항'
            : `${overseasStop ? '해외 ' : ''}${flight.stops ?? 1}회 경유`}
        </small>
        {flight.segments?.length > 1 && (
          <p>
            {flight.segments
              .slice(1)
              .map((segment) => airportName(segment.from))
              .join(' · ')}
          </p>
        )}
      </div>
      <div>
        <strong className="flightTime">{flight.arrival}</strong>
        {flight.dayOffset ? (
          <sup>
            {flight.dayOffset > 0 ? '+' : ''}
            {flight.dayOffset}일
          </sup>
        ) : null}
        <p>{flight.to || to}</p>
      </div>
    </>
  );
}

function flightCarriers(flight) {
  return flight.carriers ?? [{ key: flight.airline, label: flight.airline }];
}

function FlightsPage() {
  const { draft, setDraft, flights } = useBooking();
  const { search } = draft;
  const navigate = useNavigate();
  const [demo, setDemo] = useState(false);
  const [leg, setLeg] = useState('outbound');
  const [direct, setDirect] = useState(search.direct);
  const [airline, setAirline] = useState('all');
  const [sort, setSort] = useState('price');
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [demoError, setDemoError] = useState(false);
  const returning = leg === 'inbound';
  const from = returning ? search.to : search.from;
  const to = returning ? search.from : search.to;
  const depart = returning ? search.returnDate : search.depart;

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    async function loadFlights() {
      try {
        const response = await fetch('/api/flights/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trip: 'oneway',
            from,
            to,
            depart,
            passengers: search.passengers,
            cabin: search.cabin,
            direct,
          }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.itineraries))
          throw new Error(
            data?.error || '항공권 검색 서버에 연결할 수 없어요.',
          );

        const rows = normalizeItineraries(data.itineraries, 'oneway');
        if (data.itineraries.length && !rows.length)
          throw new Error('표시할 수 있는 여정과 운임을 받지 못했어요.');
        if (!controller.signal.aborted)
          setResult({ rows, observedAt: data.observed_at });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error.message });
      }
    }
    loadFlights();
    return () => controller.abort();
  }, [attempt, demo, depart, direct, from, search, to]);

  const roundTrip = search.trip === 'round';
  const choosingOutbound = roundTrip && !returning;
  const priceBasis = demo
    ? '성인 1명 · 일반석 예시 운임'
    : `성인 ${search.passengers}명 · ${returning ? '오는 편' : '가는 편'} 운임`;
  const rows = demo
    ? flights
        .filter((flight) => flight.available)
        .map((item) => {
          const flight = flightForRoute(item, search);
          return {
            id: flight.id,
            outbound: flight,
            inbound: null,
            quote: { amount: flight.price, currency: 'KRW' },
          };
        })
    : (result?.rows ?? []);
  const choices = rows.filter(({ outbound }) => !direct || outbound.direct);
  const airlines = new Map(
    choices.flatMap((row) =>
      flightCarriers(row.outbound).map(({ key, label }) => [key, label]),
    ),
  );
  const airlineFilter = airlines.has(airline) ? airline : 'all';
  const list = choices
    .filter(
      (row) =>
        airlineFilter === 'all' ||
        flightCarriers(row.outbound).some(({ key }) => key === airlineFilter),
    )
    .sort((a, b) => {
      if (sort === 'price')
        return (
          a.quote.currency.localeCompare(b.quote.currency) ||
          a.quote.amount - b.quote.amount
        );
      const first = a.outbound;
      const second = b.outbound;
      if (sort === 'duration') {
        const firstMinutes = first.durationMinutes ?? Infinity;
        const secondMinutes = second.durationMinutes ?? Infinity;
        if (firstMinutes !== secondMinutes) return firstMinutes - secondMinutes;
      }
      return first.time.localeCompare(second.time);
    });
  const loading = !demo && result === null;
  const error = demo
    ? demoError && '체험용 오류 상태입니다. 다시 시도해 주세요.'
    : result?.error;

  function showLeg(next) {
    setLeg(next);
    setResult(null);
    setSelected(null);
    setAirline('all');
    window.scrollTo(0, 0);
  }
  function selectFlight(row, quote) {
    const flight = demo ? row.outbound : { ...row.outbound, quote: row.quote };
    setDraft((prev) => ({
      ...prev,
      outbound: returning ? prev.outbound : flight,
      inbound: returning ? flight : null,
      quote: choosingOutbound ? null : quote,
      seats: null,
      holdUntil: null,
    }));
    if (choosingOutbound) showLeg('inbound');
    else navigate('/passengers');
  }
  function retry() {
    if (demo) setDemoError(false);
    else {
      setResult(null);
      setAttempt((previous) => previous + 1);
    }
  }
  function changeDirect(checked) {
    if (checked === direct) return;
    setDirect(checked);
    setSelected(null);
    if (!demo) setResult(null);
  }
  function changeSource() {
    setDemo(!demo);
    setDemoError(false);
    setSort('price');
    showLeg('outbound');
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
        {airportName(from)} → {airportName(to)} · {depart} ·{' '}
        {roundTrip ? '왕복' : '편도'} · 성인 {search.passengers}명 ·{' '}
        {search.cabin}
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
            onClick={() => showLeg('outbound')}
          >
            가는 편 다시 선택
          </button>
        )}
        <button
          className="secondary"
          onClick={changeSource}
        >
          {demo ? '실제 항공편 조회' : '예시 항공편으로 체험'}
        </button>
        <span className="pill">
          {demo
            ? '가상 항공사 · 체험용 운임'
            : 'Ignav 실제 항공편 조회 · 모의 예약'}
        </span>
      </div>
      {leg === 'inbound' && (
        <p className="notice">
          선택한 가는 편 · {draft.outbound.airline} · {draft.outbound.id} ·{' '}
          {draft.outbound.time}
        </p>
      )}
      <div className="flowGrid">
        <aside className="filterPanel">
          <h2>원하는 조건</h2>
          <label className="checkboxLabel">
            <input
              type="checkbox"
              checked={direct}
              onChange={(event) => changeDirect(event.target.checked)}
            />
            직항만 보기
          </label>
          <label className="stackLabel">
            항공사
            <select
              value={airlineFilter}
              onChange={(event) => setAirline(event.target.value)}
            >
              <option value="all">모든 항공사 ({airlines.size})</option>
              {[...airlines].map(([code, name]) => (
                <option
                  key={code}
                  value={code}
                >
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="textLink"
            onClick={() => {
              changeDirect(false);
              setAirline('all');
            }}
          >
            필터 초기화
          </button>
          {demo && (
            <details>
              <summary>상태 화면 체험</summary>
              <button
                className="secondary"
                onClick={() => setDemoError(true)}
              >
                조회 실패 보기
              </button>
            </details>
          )}
        </aside>
        <section>
          <div className="listHeading">
            <strong>
              {loading
                ? '항공편 조회 중'
                : `${list.length}개의 ${demo ? '예시 항공편' : '조회 항공편'}`}
            </strong>
            <label>
              정렬{' '}
              <select
                aria-label="항공편 정렬"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="price">낮은 가격순</option>
                <option value="time">빠른 출발순</option>
                {!demo && <option value="duration">짧은 소요시간순</option>}
              </select>
            </label>
          </div>
          {!demo && result?.observedAt && (
            <p className="muted">
              Ignav 조회 시각 ·{' '}
              {new Date(result.observedAt).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
              })}{' '}
              (한국 시간)
            </p>
          )}
          {loading ? (
            <div
              className="emptyPanel"
              role="status"
            >
              항공편을 불러오는 중이에요…
            </div>
          ) : error ? (
            <div
              className="emptyPanel"
              role="alert"
            >
              <h2>항공편을 불러오지 못했어요.</h2>
              <p>{error}</p>
              <button
                className="primary"
                onClick={retry}
              >
                다시 시도
              </button>
            </div>
          ) : !list.length ? (
            <div className="emptyPanel">
              <h2>
                {direct
                  ? '선택한 조건의 직항을 찾지 못했어요.'
                  : '조건에 맞는 항공편이 없어요.'}
              </h2>
              <p>
                {direct
                  ? '직항만 보기를 끄거나 출발지와 날짜를 바꿔 다시 검색해 주세요.'
                  : '필터를 변경하거나 다른 날짜로 검색해 주세요.'}
              </p>
            </div>
          ) : (
            list.map((row) => {
              const flight = row.outbound;
              const quote = demo
                ? null
                : returning
                  ? combineQuotes(draft.outbound.quote, row.quote)
                  : row.quote;
              let selectionError = '';
              if (!demo && returning) {
                if (!canReturnAfterArrival(draft.outbound, flight))
                  selectionError =
                    '가는 편 도착 후에 출발하는 오는 편을 선택해 주세요.';
                else if (!quote)
                  selectionError =
                    '가는 편과 같은 통화로 표시된 오는 편을 선택해 주세요.';
              }
              return (
                <article
                  className="flightCard"
                  key={row.id}
                >
                  <div className="flightCardTop">
                    <span className="airlineIcon">
                      <Plane size={21} />
                    </span>
                    <strong>
                      {flight.carriers?.map(({ label }) => label).join(' · ') ||
                        flight.airline}
                    </strong>
                    <small>{flight.id}</small>
                  </div>
                  <div className="flightCardBody">
                    <FlightTimes
                      flight={flight}
                      from={from}
                      to={to}
                    />
                    <div className="flightPrice">
                      <div className="flightPriceAmount">
                        <small>{priceBasis}</small>
                        <strong>
                          {money(row.quote.amount, row.quote.currency)}
                        </strong>
                      </div>
                      <button
                        className="primary"
                        onClick={() =>
                          setSelected(selected === row.id ? null : row.id)
                        }
                      >
                        운임·상세 보기 <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                  {selected === row.id && (
                    <div className="fareDetails">
                      <h3>예약 전 확인해 주세요</h3>
                      {demo ? (
                        <p>
                          체험용 항공편입니다. 시간, 운임, 수하물 조건은
                          예시입니다.
                        </p>
                      ) : (
                        <FlightDetails
                          flight={flight}
                          row={row}
                        />
                      )}
                      {selectionError && (
                        <p className="formError">{selectionError}</p>
                      )}
                      <button
                        className="primary"
                        disabled={Boolean(selectionError)}
                        onClick={() => selectFlight(row, quote)}
                      >
                        {choosingOutbound
                          ? '선택하고 오는 편 보기'
                          : demo
                            ? '선택하고 탑승객 입력'
                            : '선택하고 모의 예약 시작'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
export default FlightsPage;
