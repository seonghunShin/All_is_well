import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSearch } from './search.js';
const valid = {
  from: 'ICN',
  to: 'CJU',
  trip: 'round',
  depart: '2026-10-10',
  returnDate: '2026-10-12',
  passengers: 1,
};
test('정상 왕복 및 같은 날 왕복', () => {
  assert.equal(validateSearch(valid, '2026-10-01'), '');
  assert.equal(
    validateSearch({ ...valid, returnDate: valid.depart }, '2026-10-01'),
    '',
  );
});
test('동일 공항과 과거 출발일 차단', () => {
  assert.ok(validateSearch({ ...valid, to: 'ICN' }, '2026-10-01'));
  assert.ok(validateSearch(valid, '2026-10-11'));
});
test('왕복의 역전 날짜 차단, 편도는 귀국일 무시', () => {
  assert.ok(
    validateSearch({ ...valid, returnDate: '2026-10-09' }, '2026-10-01'),
  );
  assert.equal(
    validateSearch({ ...valid, trip: 'oneway', returnDate: '' }, '2026-10-01'),
    '',
  );
});
test('인원 범위 검증', () => {
  for (const passengers of [0, 10, 1.5])
    assert.ok(validateSearch({ ...valid, passengers }, '2026-10-01'));
});
