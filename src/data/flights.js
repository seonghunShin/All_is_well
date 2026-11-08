import { isDomesticRoute } from './destinations.js';

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
export const cabinLayouts = {
  일반석: {
    firstRow: 13,
    rowCount: 8,
    groups: ['ABC', 'DEF'],
    occupied: ['13A', '14B', '15C', '16D', '17A', '18F'],
  },
  '프리미엄 일반석': {
    firstRow: 10,
    rowCount: 3,
    groups: ['AC', 'DF'],
    occupied: ['10A'],
  },
  비즈니스석: {
    firstRow: 7,
    rowCount: 3,
    groups: ['A', 'DE', 'F'],
    occupied: ['7A'],
  },
  일등석: {
    firstRow: 1,
    rowCount: 6,
    groups: ['A', 'F'],
    occupied: ['1A'],
  },
};
export function flightForRoute(flight, search) {
  if (isDomesticRoute(search)) return { ...flight };
  const hour = Number(flight.time.slice(0, 2));
  return {
    ...flight,
    price: flight.price + 120000,
    duration: flight.direct ? '4시간' : '6시간',
    arrival: `${String(hour + (flight.direct ? 4 : 6)).padStart(2, '0')}:${flight.time.slice(3)}`,
  };
}
