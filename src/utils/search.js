export function dateAfter(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validateSearch(values, today = dateAfter()) {
  if (values.from === values.to)
    return '출발지와 도착지를 다르게 선택해 주세요.';
  if (!values.depart || values.depart < today)
    return '가는 날은 오늘 이후로 선택해 주세요.';
  if (
    values.trip === 'round' &&
    (!values.returnDate || values.returnDate < values.depart)
  )
    return '오는 날은 가는 날과 같거나 이후여야 해요.';
  if (
    !Number.isInteger(Number(values.passengers)) ||
    values.passengers < 1 ||
    values.passengers > 9
  )
    return '탑승 인원은 1명부터 9명까지 선택할 수 있어요.';
  return '';
}
