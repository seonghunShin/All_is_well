import { airports } from '../data/destinations';
import { Plane, Check } from 'lucide-react';
function SearchResults({ search }) {
  if (!search) return null;
  const name = (code) => airports.find((item) => item.code === code)?.name;
  return (
    <section
      className="results container"
      id="results"
      tabIndex={-1}
      aria-labelledby="resultsTitle"
    >
      <span className="eyebrow">SEARCH PREVIEW</span>
      <h2 id="resultsTitle">
        검색 조건을 확인해 주세요 <Check size={23} />
      </h2>
      <p>
        {name(search.from)} → {name(search.to)} ·{' '}
        {search.trip === 'round' ? '왕복' : '편도'} · {search.depart}
        {search.trip === 'round' ? ` ~ ${search.returnDate}` : ''} · 성인{' '}
        {search.passengers}명 · {search.cabin} ·{' '}
        {search.direct ? '직항만' : '경유 포함'}
      </p>
      <div className="resultCard">
        <span className="resultIcon">
          <Plane />
        </span>
        <div>
          <strong>항공편 검색 준비가 되었어요.</strong>
          <p>
            선택한 조건이 정상적으로 입력되었습니다. 실제 항공편과 가격은 항공
            API 연결 후 표시됩니다.
          </p>
        </div>
        <span className="pill">체험 화면</span>
      </div>
      <p className="resultDisclaimer">
        현재는 항공권 구매, 좌석 선택, 결제가 진행되지 않습니다. 위 검색창에서
        조건을 바꿔 다시 검색할 수 있어요.
      </p>
    </section>
  );
}
export default SearchResults;
