import { createContext, useContext, useState } from 'react';
import { initialFlights } from './data/flights';
const BookingContext = createContext(null);
// 서버가 연결되기 전의 메모리 저장소입니다. 개인정보를 브라우저 저장소에 기록하지 않습니다.
export function BookingProvider({ children }) {
  const [draft, setDraft] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [user, setUser] = useState(null);
  const [flights, setFlights] = useState(initialFlights);
  return (
    <BookingContext.Provider
      value={{
        draft,
        setDraft,
        bookings,
        setBookings,
        user,
        setUser,
        flights,
        setFlights,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}
export function useBooking() {
  return useContext(BookingContext);
}
