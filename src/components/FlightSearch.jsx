import { useState } from 'react';
import { ArrowLeftRight, ArrowRight, Search, Info } from 'lucide-react';
import { airportGroups } from '../data/destinations';
import { cabinLayouts } from '../data/flights';
import { dateAfter, validateSearch } from '../utils/search';
function FlightSearch({ values, onChange, onSubmit }) {
  const [error, setError] = useState('');
  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    onChange((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setError('');
  }
  function handleSubmit(event) {
    event.preventDefault();
    const message = validateSearch(values);
    setError(message);
    if (!message) onSubmit({ ...values });
  }
  const airportOptions = airportGroups.map((group) => (
    <optgroup
      key={group.label}
      label={group.label}
    >
      {group.airports.map((airport) => (
        <option
          key={airport.code}
          value={airport.code}
        >
          {airport.name} ({airport.code})
        </option>
      ))}
    </optgroup>
  ));
  return (
    <form
      id="search"
      className="searchForm"
      onSubmit={handleSubmit}
    >
      <div className="searchTop">
        <fieldset className="tripOptions">
          <legend className="srOnly">여행 유형</legend>
          <label>
            <input
              type="radio"
              name="trip"
              value="round"
              checked={values.trip === 'round'}
              onChange={handleChange}
            />
            왕복
          </label>
          <label>
            <input
              type="radio"
              name="trip"
              value="oneway"
              checked={values.trip === 'oneway'}
              onChange={handleChange}
            />
            편도
          </label>
        </fieldset>
        <span>떠나고 싶은 곳만 알려주세요.</span>
      </div>
      <div className="searchFields">
        <div className="routeFields">
          <label className="field">
            출발지
            <select
              name="from"
              value={values.from}
              onChange={handleChange}
            >
              {airportOptions}
            </select>
          </label>
          <button
            type="button"
            className="swapButton"
            aria-label="출발지와 도착지 바꾸기"
            onClick={() =>
              onChange((prev) => ({ ...prev, from: prev.to, to: prev.from }))
            }
          >
            <ArrowLeftRight size={18} />
          </button>
          <label className="field">
            도착지
            <select
              name="to"
              value={values.to}
              onChange={handleChange}
            >
              {airportOptions}
            </select>
          </label>
        </div>
        <label className="field">
          가는 날
          <input
            aria-label="가는 날"
            type="date"
            name="depart"
            min={dateAfter()}
            value={values.depart}
            onChange={handleChange}
            required
          />
        </label>
        <label
          className={`field ${values.trip === 'oneway' ? 'disabledField' : ''}`}
        >
          오는 날
          <input
            aria-label="오는 날"
            type="date"
            name="returnDate"
            min={values.depart || dateAfter()}
            value={values.trip === 'oneway' ? '' : values.returnDate}
            onChange={handleChange}
            disabled={values.trip === 'oneway'}
            required={values.trip === 'round'}
          />
        </label>
        <div className="travelerFields">
          <label className="field">
            탑승 인원
            <select
              name="passengers"
              value={values.passengers}
              onChange={handleChange}
            >
              {Array.from({ length: 9 }, (_, i) => (
                <option
                  key={i + 1}
                  value={i + 1}
                >
                  성인 {i + 1}명
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            좌석 등급
            <select
              name="cabin"
              value={values.cabin}
              onChange={handleChange}
            >
              {Object.keys(cabinLayouts).map((cabin) => (
                <option key={cabin}>{cabin}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="searchBottom">
        <label className="checkboxLabel">
          <input
            type="checkbox"
            name="direct"
            checked={values.direct}
            onChange={handleChange}
          />
          직항만 보기
        </label>
        <button
          type="submit"
          className="primary searchButton"
        >
          <Search size={19} /> 항공권 검색 <ArrowRight size={19} />
        </button>
      </div>
      {error && (
        <p
          className="formError"
          role="alert"
        >
          {error}
        </p>
      )}
      <p className="demoNote">
        <Info size={14} /> 실제 항공편과 조회 운임을 검색할 수 있어요. 좌석
        선택과 결제는 모의 환경에서 진행됩니다.
      </p>
    </form>
  );
}
export default FlightSearch;
