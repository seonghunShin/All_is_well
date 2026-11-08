export function totalPrice(draft) {
  if (!draft?.outbound) return 0;
  const multiplier =
    { 일반석: 1, '프리미엄 일반석': 1.5, 비즈니스석: 2.5, 일등석: 4 }[
      draft.search.cabin
    ] || 1;
  return Math.round(
    (draft.outbound.price + (draft.inbound?.price || 0)) *
      Number(draft.search.passengers) *
      multiplier,
  );
}
export function validPassengers(passengers, international) {
  return passengers.every(
    (person) =>
      person.name.trim().length >= 2 &&
      /^\d{4}-\d{2}-\d{2}$/.test(person.birth) &&
      (!international || /^[A-Za-z0-9]{6,12}$/.test(person.passport)),
  );
}
export const money = (value) => `${Number(value).toLocaleString('ko-KR')}원`;
