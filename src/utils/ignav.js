const currencies = new Set(Intl.supportedValuesOf('currency'));
const airportCode = /^[A-Z]{3}$/;
const localTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const zonedTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const dayMs = 86_400_000;

function localTime(value) {
  if (typeof value !== 'string' || !localTimestamp.test(value)) return null;

  // Treat the local calendar date as UTC only to calculate its day number.
  const timestamp = Date.parse(`${value}Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 19) !== value
  ) {
    return null;
  }

  return { time: value.slice(11, 16), day: Math.floor(timestamp / dayMs) };
}

function formatDuration(minutes) {
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours && `${hours}시간`, remainder && `${remainder}분`]
    .filter(Boolean)
    .join(' ');
}

function durationMinutes(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function utcTimestamp(value) {
  if (
    typeof value !== 'string' ||
    !zonedTimestamp.test(value) ||
    !localTime(value.slice(0, 19))
  ) {
    return NaN;
  }
  return Date.parse(value);
}

export function canReturnAfterArrival(outbound, inbound) {
  const arrival = outbound?.segments?.at(-1);
  const departure = inbound?.segments?.[0];
  if (!arrival || !departure) return true;

  const arrivalUtc = utcTimestamp(arrival.arrivalUtc);
  const departureUtc = utcTimestamp(departure.departureUtc);
  if (Number.isFinite(arrivalUtc) && Number.isFinite(departureUtc)) {
    return departureUtc > arrivalUtc;
  }

  if (
    arrival.to &&
    arrival.to === departure.from &&
    localTime(arrival.arrivalLocal) &&
    localTime(departure.departureLocal)
  ) {
    return departure.departureLocal > arrival.arrivalLocal;
  }

  return true;
}

function marketingCarriers(segments, legCarrier, airline) {
  const names = new Map();
  for (const { marketingCode, operatingAirline } of segments) {
    if (marketingCode && !names.get(marketingCode)) {
      names.set(marketingCode, operatingAirline);
    }
  }
  if (!names.size) return [{ key: `name:${airline}`, label: airline }];

  return [...names].map(([key, name]) => ({
    key,
    label:
      (names.size === 1 && legCarrier) || (name ? `${name} (${key})` : key),
  }));
}

function normalizeLeg(leg) {
  if (!Array.isArray(leg?.segments) || !leg.segments.length) return null;
  const segments = [];
  let firstDeparture;
  let lastArrival;

  for (const segment of leg.segments) {
    const from = segment?.departure_airport;
    const to = segment?.arrival_airport;
    const departureLocal = segment?.departure_time_local;
    const arrivalLocal = segment?.arrival_time_local;
    const departure = localTime(departureLocal);
    const arrival = localTime(arrivalLocal);
    if (
      typeof from !== 'string' ||
      typeof to !== 'string' ||
      !airportCode.test(from) ||
      !airportCode.test(to) ||
      !departure ||
      !arrival
    ) {
      return null;
    }

    firstDeparture ??= departure;
    lastArrival = arrival;
    segments.push({
      from,
      to,
      departureLocal,
      arrivalLocal,
      departureUtc: textOrNull(segment.departure_time_utc),
      arrivalUtc: textOrNull(segment.arrival_time_utc),
      flightNumber: textOrNull(segment.flight_number),
      marketingCode: textOrNull(segment.marketing_carrier_code),
      operatingAirline: textOrNull(segment.operating_carrier_name),
      duration: formatDuration(durationMinutes(segment.duration_minutes)),
      aircraft: textOrNull(segment.aircraft),
    });
  }

  const first = segments[0];
  const last = segments.at(-1);
  const legCarrier = textOrNull(leg.carrier);
  const airline =
    legCarrier ??
    first.operatingAirline ??
    first.marketingCode ??
    '항공사 정보 없음';
  const carriers = marketingCarriers(segments, legCarrier, airline);
  const minutes = durationMinutes(leg.duration_minutes);
  return {
    id:
      segments
        .filter(({ flightNumber }) => flightNumber)
        .map(
          ({ marketingCode, flightNumber }) =>
            `${marketingCode ?? ''}${flightNumber}`,
        )
        .join(', ') || '편명 미제공',
    airline,
    time: firstDeparture.time,
    arrival: lastArrival.time,
    duration: formatDuration(minutes) ?? '소요 시간 미제공',
    durationMinutes: minutes,
    direct: segments.length === 1,
    stops: segments.length - 1,
    from: first.from,
    to: last.to,
    dayOffset: lastArrival.day - firstDeparture.day,
    segments,
    carriers,
    hasMixedCarriers: carriers.length > 1,
  };
}

function bagCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function normalizeItineraries(itineraries, trip) {
  if (!Array.isArray(itineraries) || !['oneway', 'round'].includes(trip))
    return [];

  return itineraries.flatMap((itinerary) => {
    const id = itinerary?.ignav_id;
    const { amount, currency, status } = itinerary?.price ?? {};
    if (
      typeof id !== 'string' ||
      !id.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !currencies.has(currency)
    ) {
      return [];
    }

    const outbound = normalizeLeg(itinerary.outbound);
    const inbound = trip === 'round' ? normalizeLeg(itinerary.inbound) : null;
    if (!outbound || (trip === 'round' && !inbound)) return [];

    return [
      {
        id,
        quote: { amount, currency },
        outbound,
        inbound,
        priceStatus: ['verified', 'unverified'].includes(status)
          ? status
          : null,
        bags: {
          carryOn: bagCount(itinerary.bags?.carry_on),
          checked: bagCount(itinerary.bags?.checked),
        },
        selfTransfer: itinerary.requires_self_transfer === true,
        mixedCarriers: itinerary.has_mixed_carriers === true,
      },
    ];
  });
}
