import { useEffect, useRef, useState } from 'react';
import { requestJson } from './api';

const bookingsPath = '/api/bookings';
const queuePath = `${bookingsPath}/queue`;

function leaveQueue(session) {
  if (!session) return Promise.resolve();
  session.stopped = true;
  if (!session.leaving) {
    session.leaving = (async () => {
      const admitted = await session.joined?.catch(() => null);
      if (admitted?.token && !session.completed) {
        try {
          await requestJson(queuePath, { method: 'DELETE', token: admitted.token, keepalive: true });
        } catch (error) {
          if (![401, 404, 410].includes(error.status)) throw error;
        }
      }
    })();
    // Once the request is settled, another attempt can retry a failed withdrawal.
    session.leaving.catch(() => { session.leaving = null; });
  }
  return session.leaving;
}

export function useServerBooking(offerId, onBooked, onClose) {
  const sessionRef = useRef(null);
  const busyRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [queue, setQueue] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [hold, setHold] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const session = { stopped: false, completed: false };
    const controller = new AbortController();
    sessionRef.current = session;
    let timer;

    const update = async (state) => {
      if (session.stopped) return;
      setQueue(state);
      if (state.state === 'WAITING') {
        timer = window.setTimeout(async () => {
          if (session.stopped) return;
          try {
            await update(await requestJson(queuePath, { token: state.token, signal: controller.signal }));
          } catch (err) {
            if (!session.stopped) setError(err.message);
          }
        }, 1200);
      } else if (state.state === 'ADMITTED') {
        const seats = await requestJson(`${bookingsPath}/availability?offerId=${encodeURIComponent(offerId)}`, {
          token: state.token, signal: controller.signal,
        });
        if (!session.stopped) setAvailability(seats);
      } else {
        setError('예약을 시작하려면 대기열에 다시 입장해 주세요.');
      }
    };

    // React StrictMode can mount and immediately clean up an effect.
    timer = window.setTimeout(async () => {
      session.joined = requestJson(queuePath, { method: 'POST' });
      try {
        await update(await session.joined);
      } catch (err) {
        if (!session.stopped) setError(err.message);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      void leaveQueue(session).catch(() => {});
    };
  }, [offerId, attempt]);

  useEffect(() => {
    if (!hold) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hold]);

  const run = async (action) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const refreshAvailability = async () => {
    const data = await requestJson(`${bookingsPath}/availability?offerId=${encodeURIComponent(offerId)}`, { token: queue.token });
    setAvailability(data);
  };

  const holdSeats = (seats) => run(async () => {
    try {
      const response = await requestJson(`${bookingsPath}/holds`, {
        method: 'POST', token: queue.token, body: { offerId, seats },
      });
      setNow(Date.now());
      setHold(response);
    } catch (err) {
      if (err.code === 'SEAT_UNAVAILABLE') await refreshAvailability();
      throw err;
    }
  });

  const confirm = () => run(async () => {
    const receipt = await requestJson(`${bookingsPath}/holds/${encodeURIComponent(hold.holdId)}/confirm`, {
      method: 'POST', token: queue.token,
    });
    sessionRef.current.completed = true;
    setDone(receipt);
    onBooked(receipt);
  });

  const changeSeats = () => run(async () => {
    try {
      await requestJson(`${bookingsPath}/holds/${encodeURIComponent(hold.holdId)}`, { method: 'DELETE', token: queue.token });
    } catch (err) {
      if (err.status !== 404 && err.status !== 410) throw err;
    }
    setHold(null);
    await refreshAvailability();
  });

  return {
    queue, availability, hold, done, error, busy, holdSeconds: hold ? Math.max(0, Math.ceil((Date.parse(hold.expiresAt) - now) / 1000)) : 0,
    holdSeats, confirm, changeSeats,
    restart: () => run(async () => {
      await leaveQueue(sessionRef.current);
      setQueue(null);
      setAvailability(null);
      setHold(null);
      setAttempt((value) => value + 1);
    }),
    close: () => run(async () => {
      try {
        await leaveQueue(sessionRef.current);
      } finally {
        onClose();
      }
    }),
  };
}
