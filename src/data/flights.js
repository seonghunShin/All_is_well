export const initialFlights = [
  {
    id: 'AW101',
    airline: '올웰 항공',
    time: '08:10',
    arrival: '09:20',
    duration: '1시간 10분',
    price: 68000,
    direct: true,
    available: true,
  },
  {
    id: 'AW203',
    airline: '하늘 항공',
    time: '11:40',
    arrival: '12:55',
    duration: '1시간 15분',
    price: 82000,
    direct: true,
    available: true,
  },
  {
    id: 'AW305',
    airline: '올웰 항공',
    time: '15:20',
    arrival: '18:30',
    duration: '3시간 10분',
    price: 59000,
    direct: false,
    available: true,
  },
];
export const occupiedSeats = ['1A', '2B', '3C', '4D', '5A', '6F'];
export function flightForRoute(flight, search) {
  const domestic =
    ['ICN', 'GMP', 'PUS', 'CJU'].includes(search.from) &&
    ['ICN', 'GMP', 'PUS', 'CJU'].includes(search.to);
  if (domestic) return { ...flight };
  const hour = Number(flight.time.slice(0, 2));
  return {
    ...flight,
    price: flight.price + 120000,
    duration: flight.direct ? '4시간' : '6시간',
    arrival: `${String(hour + (flight.direct ? 4 : 6)).padStart(2, '0')}:${flight.time.slice(3)}`,
  };
}
