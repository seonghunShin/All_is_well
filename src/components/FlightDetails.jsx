import { airportName } from './BookingUI';

function airportLabel(code) {
  const name = airportName(code);
  return name === code ? code : `${name} (${code})`;
}

export default function FlightDetails({ flight, row }) {
  const bags = [
    ['기내', row.bags?.carryOn],
    ['위탁', row.bags?.checked],
  ]
    .filter(([, count]) => count != null)
    .map(([label, count]) => `${label} ${count}개`);

  return (
    <>
      <ol
        className="flightSegments"
        aria-label="구간별 운항 정보"
      >
        {flight.segments.map((segment, index) => (
          <li key={index}>
            <strong>
              {airportLabel(segment.from)} → {airportLabel(segment.to)}
            </strong>
            <p>
              {segment.departureLocal.replace('T', ' ').slice(0, 16)} →{' '}
              {segment.arrivalLocal.replace('T', ' ').slice(0, 16)}
              {segment.duration && ` · ${segment.duration}`}
            </p>
            <p>
              {[
                segment.flightNumber &&
                  `편명 ${segment.marketingCode ?? ''}${segment.flightNumber}`,
                segment.operatingAirline && `운항 ${segment.operatingAirline}`,
                segment.aircraft,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </li>
        ))}
      </ol>
      <p>출발과 도착은 각 공항의 현지 시간입니다.</p>
      {(row.mixedCarriers || flight.hasMixedCarriers) && (
        <p>여러 판매 항공사가 포함된 여정입니다.</p>
      )}
      {row.selfTransfer && <p>별도 발권 환승이 포함된 여정입니다.</p>}
      {bags.length > 0 && <p>성인 1명당 제공 수하물 · {bags.join(' · ')}</p>}
      {row.priceStatus && (
        <p>
          조회 운임 확인 상태 ·{' '}
          {row.priceStatus === 'verified' ? '확인됨' : '미확인'}
        </p>
      )}
      <p>
        조회 운임을 체험 금액으로 사용하며 좌석과 결제는 모의 환경에서 진행돼요.
      </p>
    </>
  );
}
