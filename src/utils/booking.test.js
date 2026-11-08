import test from 'node:test';
import assert from 'node:assert/strict';
import { totalPrice, validPassengers } from './booking.js';
import { flightForRoute } from '../data/flights.js';
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
