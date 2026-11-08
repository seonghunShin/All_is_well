import test from 'node:test';
import assert from 'node:assert/strict';
import { combineQuotes, totalPrice, validPassengers } from './booking.js';
import { isDomesticRoute } from '../data/destinations.js';
import { cabinLayouts, flightForRoute } from '../data/flights.js';
test('왕복 총액에 인원과 좌석 등급 반영', () => {
  assert.equal(
    totalPrice({
      search: { passengers: 2, cabin: '비즈니스석' },
      outbound: { price: 68000 },
      inbound: { price: 82000 },
    }),
    750000,
  );
});
test('편도는 귀국 운임을 더하지 않음', () => {
  assert.equal(
    totalPrice({
      search: { passengers: 1, cabin: '일반석' },
      outbound: { price: 68000 },
    }),
    68000,
  );
  assert.equal(totalPrice(null), 0);
});
test('실제 조회한 왕복 운임은 전체 인원과 등급이 반영된 총액', () => {
  assert.equal(
    totalPrice({
      search: { passengers: 2, cabin: '비즈니스석' },
      outbound: { id: 'YP731' },
      inbound: { id: 'YP732' },
      quote: { amount: 474000, currency: 'KRW' },
    }),
    474000,
  );
});
test('왕복 모의 결제는 각각 조회한 같은 통화의 구간 운임을 합산한다', () => {
  const outbound = { amount: 237000, currency: 'KRW' };
  const inbound = { amount: 189000, currency: 'KRW' };
  assert.deepEqual(combineQuotes(outbound, inbound), {
    amount: 426000,
    currency: 'KRW',
  });
  assert.equal(combineQuotes(outbound, { amount: 130, currency: 'USD' }), null);
});
test('국제선 여권 필수, 국내선 생략 가능', () => {
  const people = [{ name: '홍길동', birth: '1980-01-01', passport: '' }];
  assert.equal(validPassengers(people, false), true);
  assert.equal(validPassengers(people, true), false);
  assert.equal(
    validPassengers([{ ...people[0], passport: 'M12345678' }], true),
    true,
  );
});
test('국제선 예시 운임만 가산하고 원본 보존', () => {
  const flight = { price: 68000, time: '08:10', direct: true };
  assert.equal(
    flightForRoute(flight, { from: 'ICN', to: 'NRT' }).price,
    188000,
  );
  assert.equal(flight.price, 68000);
});
test('새로 추가한 국내 공항도 국내선 운임과 탑승객 조건을 적용한다', () => {
  const domestic = { from: 'CJJ', to: 'CJU' };
  const international = { from: 'GMP', to: 'HND' };
  const flight = { price: 68000, time: '08:10', direct: true };
  const people = [{ name: '홍길동', birth: '1980-01-01', passport: '' }];

  assert.equal(flightForRoute(flight, domestic).price, 68000);
  assert.equal(validPassengers(people, !isDomesticRoute(domestic)), true);
  assert.equal(validPassengers(people, !isDomesticRoute(international)), false);
});
test('국내 공항 사이를 이동해도 해외 공항을 거치면 국내선으로 분류하지 않는다', () => {
  assert.equal(
    isDomesticRoute({
      from: 'ICN',
      to: 'CJU',
      segments: [
        { from: 'ICN', to: 'FUK' },
        { from: 'FUK', to: 'CJU' },
      ],
    }),
    false,
  );
});
test('등급별 가상 좌석 번호가 겹치지 않고 최대 9명이 선택할 수 있다', () => {
  const allSeats = new Set();
  for (const layout of Object.values(cabinLayouts)) {
    const seats = Array.from({ length: layout.rowCount }, (_, index) =>
      [...layout.groups.join('')].map(
        (letter) => `${layout.firstRow + index}${letter}`,
      ),
    ).flat();
    assert.ok(layout.occupied.every((seat) => seats.includes(seat)));
    assert.ok(seats.length - layout.occupied.length >= 9);
    for (const seat of seats) {
      assert.ok(!allSeats.has(seat), `중복 좌석 ${seat}`);
      allSeats.add(seat);
    }
  }
});
