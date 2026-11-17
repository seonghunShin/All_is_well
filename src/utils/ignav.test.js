import test from 'node:test';
import assert from 'node:assert/strict';
import { canReturnAfterArrival, normalizeItineraries } from './ignav.js';

const outboundSegment = {
  marketing_carrier_code: 'KE',
  flight_number: '901',
  operating_carrier_name: '대한항공',
  departure_airport: 'ICN',
  departure_time_local: '2026-12-07T14:30:00',
  departure_time_utc: '2026-12-07T05:30:00Z',
  arrival_airport: 'CDG',
  arrival_time_local: '2026-12-07T20:20:00',
  arrival_time_utc: '2026-12-07T19:20:00Z',
};
const itinerary = {
  ignav_id: 'quote-id',
  price: { amount: 237000, currency: 'KRW' },
  outbound: { duration_minutes: 830, segments: [outboundSegment] },
};

test('편도 여정은 전체 운임과 공항 현지 시각을 그대로 유지한다', () => {
  assert.deepEqual(normalizeItineraries([itinerary], 'oneway'), [
    {
      id: 'quote-id',
      quote: { amount: 237000, currency: 'KRW' },
      outbound: {
        id: 'KE901',
        airline: '대한항공',
        time: '14:30',
        arrival: '20:20',
        duration: '13시간 50분',
        durationMinutes: 830,
        direct: true,
        stops: 0,
        from: 'ICN',
        to: 'CDG',
        dayOffset: 0,
        segments: [
          {
            from: 'ICN',
            to: 'CDG',
            departureLocal: '2026-12-07T14:30:00',
            arrivalLocal: '2026-12-07T20:20:00',
            departureUtc: '2026-12-07T05:30:00Z',
            arrivalUtc: '2026-12-07T19:20:00Z',
            flightNumber: '901',
            marketingCode: 'KE',
            operatingAirline: '대한항공',
            duration: null,
            aircraft: null,
          },
        ],
        carriers: [{ key: 'KE', label: '대한항공 (KE)' }],
        hasMixedCarriers: false,
      },
      inbound: null,
      priceStatus: null,
      bags: { carryOn: null, checked: null },
      selfTransfer: false,
      mixedCarriers: false,
    },
  ]);
});

test('왕복 여정은 구간을 묶고 날짜 경계와 소수 운임을 유지한다', () => {
  const roundTrip = {
    ...itinerary,
    price: { amount: 799.25, currency: 'USD' },
    outbound: {
      carrier: '하와이안 항공',
      duration_minutes: 840,
      segments: [
        {
          ...outboundSegment,
          marketing_carrier_code: 'HA',
          flight_number: '449',
          departure_airport: 'HNL',
          departure_time_local: '2026-12-07T06:30:00',
          departure_time_utc: '2026-12-07T16:30:00Z',
          arrival_airport: 'KIX',
          arrival_time_local: '2026-12-08T11:20:00',
          arrival_time_utc: '2026-12-08T02:20:00Z',
        },
        {
          ...outboundSegment,
          marketing_carrier_code: 'JL',
          flight_number: '220',
          departure_airport: 'KIX',
          departure_time_local: '2026-12-08T14:30:00',
          departure_time_utc: '2026-12-08T05:30:00Z',
          arrival_airport: 'NRT',
          arrival_time_local: '2026-12-08T15:30:00',
          arrival_time_utc: '2026-12-08T06:30:00Z',
        },
      ],
    },
    inbound: {
      segments: [
        {
          marketing_carrier_code: null,
          flight_number: null,
          operating_carrier_name: null,
          departure_airport: 'NRT',
          departure_time_local: '2026-12-15T01:30:00',
          arrival_airport: 'HNL',
          arrival_time_local: '2026-12-14T14:30:00',
        },
      ],
    },
  };
  const [fare] = normalizeItineraries([roundTrip], 'round');
  assert.deepEqual(fare.quote, { amount: 799.25, currency: 'USD' });
  assert.equal(fare.outbound.id, 'HA449, JL220');
  assert.equal(fare.outbound.airline, '하와이안 항공');
  assert.equal(fare.outbound.duration, '14시간');
  assert.equal(fare.outbound.stops, 1);
  assert.equal(fare.outbound.direct, false);
  assert.equal(fare.outbound.dayOffset, 1);
  assert.equal(fare.outbound.hasMixedCarriers, true);
  assert.equal(fare.inbound.dayOffset, -1);
  assert.equal(fare.inbound.id, '편명 미제공');
  assert.equal(fare.inbound.duration, '소요 시간 미제공');
  assert.equal(fare.inbound.durationMinutes, null);
  assert.equal(fare.inbound.segments[0].departureUtc, null);
  assert.deepEqual(fare.inbound.carriers, [
    { key: 'name:항공사 정보 없음', label: '항공사 정보 없음' },
  ]);
  assert.equal(normalizeItineraries([roundTrip], 'oneway')[0].inbound, null);
});

test('조회 운임 상태와 수하물, 운항 구간 및 판매 항공사를 보존한다', () => {
  const segment = {
    ...outboundSegment,
    duration_minutes: 830,
    aircraft: 'Boeing 777',
  };
  const [fare] = normalizeItineraries(
    [
      {
        ...itinerary,
        price: { ...itinerary.price, status: 'unverified' },
        bags: { carry_on: 0, checked: 1 },
        requires_self_transfer: true,
        has_mixed_carriers: true,
        outbound: {
          carrier: '에어프랑스',
          duration_minutes: 830,
          segments: [{ ...segment, marketing_carrier_code: 'AF' }],
        },
      },
    ],
    'oneway',
  );

  assert.equal(fare.priceStatus, 'unverified');
  assert.deepEqual(fare.bags, { carryOn: 0, checked: 1 });
  assert.equal(fare.selfTransfer, true);
  assert.equal(fare.mixedCarriers, true);
  assert.equal(fare.outbound.hasMixedCarriers, false);
  assert.deepEqual(fare.outbound.carriers, [
    { key: 'AF', label: '에어프랑스' },
  ]);
  assert.equal(fare.outbound.segments[0].marketingCode, 'AF');
  assert.equal(fare.outbound.segments[0].operatingAirline, '대한항공');
  assert.equal(fare.outbound.segments[0].duration, '13시간 50분');
  assert.equal(fare.outbound.segments[0].aircraft, 'Boeing 777');
});

test('판매 항공사 코드는 중복을 묶고 이름이 없는 코드는 그대로 표시한다', () => {
  const [fare] = normalizeItineraries(
    [
      {
        ...itinerary,
        price: { ...itinerary.price, status: 'verified' },
        bags: { carry_on: '1', checked: -1 },
        outbound: {
          segments: [
            { ...outboundSegment, operating_carrier_name: null },
            outboundSegment,
            {
              ...outboundSegment,
              marketing_carrier_code: 'AF',
              operating_carrier_name: null,
            },
          ],
        },
      },
    ],
    'oneway',
  );

  assert.deepEqual(fare.outbound.carriers, [
    { key: 'KE', label: '대한항공 (KE)' },
    { key: 'AF', label: 'AF' },
  ]);
  assert.equal(fare.outbound.hasMixedCarriers, true);
  assert.deepEqual(fare.bags, { carryOn: null, checked: null });
  assert.equal(fare.priceStatus, 'verified');
});

test('여정 키, 유효한 운임, 구간 시각과 왕복 복편을 검증한다', () => {
  const brokenFares = [
    null,
    { ...itinerary, ignav_id: '' },
    { ...itinerary, price: { amount: 0, currency: 'KRW' } },
    { ...itinerary, price: { amount: '237000', currency: 'KRW' } },
    { ...itinerary, price: { amount: 237000, currency: 'ZZZ' } },
    { ...itinerary, outbound: { segments: [] } },
    { ...itinerary, outbound: { segments: [null] } },
    {
      ...itinerary,
      outbound: {
        segments: [
          { ...outboundSegment, departure_time_local: '2026-02-31T14:30:00' },
        ],
      },
    },
  ];
  assert.deepEqual(normalizeItineraries(brokenFares, 'oneway'), []);
  assert.deepEqual(normalizeItineraries([itinerary], 'round'), []);
  assert.deepEqual(normalizeItineraries({}, 'oneway'), []);
});

test('같은 공항에서는 왕복 도착일과 출발일을 포함한 현지 시각을 비교한다', () => {
  const outbound = {
    segments: [
      { to: 'KIX', arrivalLocal: '2026-12-08T20:00:00' },
      { to: 'NRT', arrivalLocal: '2026-12-08T23:55:00' },
    ],
  };
  const returning = (departureLocal, from = 'NRT') => ({
    segments: [{ from, departureLocal }],
  });

  assert.equal(
    canReturnAfterArrival(outbound, returning('2026-12-08T22:30:00')),
    false,
  );
  assert.equal(
    canReturnAfterArrival(outbound, returning('2026-12-08T23:55:00')),
    false,
  );
  assert.equal(
    canReturnAfterArrival(outbound, returning('2026-12-09T00:05:00')),
    true,
  );
  assert.equal(
    canReturnAfterArrival(outbound, returning('2026-12-08T22:30:00', 'HND')),
    true,
  );
});

test('UTC 시각이 있으면 다른 공항의 현지 시간대 대신 UTC를 비교한다', () => {
  const outbound = {
    segments: [
      {
        to: 'CDG',
        arrivalLocal: '2026-12-07T20:20:00',
        arrivalUtc: '2026-12-07T19:20:00Z',
      },
    ],
  };
  const inbound = {
    segments: [
      {
        from: 'LHR',
        departureLocal: '2026-12-07T19:30:00',
        departureUtc: '2026-12-07T19:30:00+00:00',
      },
    ],
  };
  assert.equal(canReturnAfterArrival(outbound, inbound), true);
  inbound.segments[0].departureUtc = '2026-12-07T19:15:00Z';
  assert.equal(canReturnAfterArrival(outbound, inbound), false);
  inbound.segments[0].departureUtc = '2026-12-07T19:15:00';
  assert.equal(canReturnAfterArrival(outbound, inbound), true);
});
