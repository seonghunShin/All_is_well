export function combineQuotes(outbound, inbound) {
  if (!outbound || !inbound || outbound.currency !== inbound.currency)
    return null;
  return {
    amount: outbound.amount + inbound.amount,
    currency: outbound.currency,
  };
}

export function totalPrice(draft) {
  if (!draft?.outbound) return 0;
  if (draft.quote) return draft.quote.amount;
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
export function money(value, currency = 'KRW') {
  if (currency === 'KRW') return `${Number(value).toLocaleString('ko-KR')}원`;
  return Number(value).toLocaleString('ko-KR', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  });
}
