const API_BASE = 'https://ignav.com/api';
const SEARCH_ROUTE = '/api/flights/search';
const BODY_LIMIT = 10 * 1024;
const DAILY_LIMIT = 100;
const CACHE_LIMIT = 500;
const CACHE_TTL = 10 * 60_000;
const CABINS = new Map([
  ['일반석', 'economy'],
  ['프리미엄 일반석', 'premium_economy'],
  ['비즈니스석', 'business'],
  ['일등석', 'first'],
]);

class SearchError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function todayInKorea() {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function observationTime(value) {
  const isoTimestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  return typeof value === 'string' &&
    isoTimestamp.test(value) &&
    validDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function searchParameters(input) {
  const { trip, from, to, depart, returnDate, passengers, cabin } = input;
  if (trip !== 'round' && trip !== 'oneway') {
    throw new SearchError(400, '여행 유형을 확인해 주세요.');
  }
  const airportCode = /^[A-Z]{3}$/;
  if (
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    !airportCode.test(from) ||
    !airportCode.test(to) ||
    from === to
  ) {
    throw new SearchError(400, '출발지와 도착지의 공항 코드를 확인해 주세요.');
  }
  if (!validDate(depart) || depart < todayInKorea()) {
    throw new SearchError(400, '가는 날은 오늘 이후로 선택해 주세요.');
  }
  if (trip === 'round' && (!validDate(returnDate) || returnDate < depart)) {
    throw new SearchError(400, '오는 날은 가는 날과 같거나 이후여야 해요.');
  }
  const adults =
    typeof passengers === 'string' && /^[1-9]$/.test(passengers)
      ? Number(passengers)
      : passengers;
  if (!Number.isInteger(adults) || adults < 1 || adults > 9) {
    throw new SearchError(400, '탑승 인원은 1명부터 9명까지 선택해 주세요.');
  }
  const cabinClass = CABINS.get(cabin);
  if (!cabinClass) throw new SearchError(400, '좌석 등급을 확인해 주세요.');

  const body = {
    origin: from,
    destination: to,
    departure_date: depart,
    adults,
    cabin_class: cabinClass,
    market: 'KR',
  };
  if (trip === 'round') body.return_date = returnDate;
  if (input.direct === true) body.max_stops = 0;
  return {
    path: trip === 'round' ? '/fares/round-trip' : '/fares/one-way',
    body,
  };
}

function localRequest(req) {
  const { host, origin } = req.headers;
  const localHost = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;
  const protocol = req.socket.encrypted ? 'https' : 'http';
  return (
    localHost.test(host ?? '') &&
    (!origin || origin === `${protocol}://${host}`)
  );
}

async function readJson(req) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')
  ) {
    throw new SearchError(415, '검색 요청 형식을 확인해 주세요.');
  }
  const tooLarge = () => new SearchError(413, '검색 요청이 너무 커요.');
  if (Number(req.headers['content-length']) > BODY_LIMIT) throw tooLarge();
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw tooLarge();
    chunks.push(chunk);
  }

  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new SearchError(400, '검색 요청 형식을 확인해 주세요.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new SearchError(400, '검색 요청 형식을 확인해 주세요.');
  }
  return data;
}

function sendJson(res, status, data) {
  if (res.destroyed) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function upstreamError(status, code) {
  switch (status) {
    case 400:
    case 422:
      return new SearchError(400, '공항과 날짜 등 검색 조건을 확인해 주세요.');
    case 401:
      return new SearchError(
        502,
        '서버에 설정한 Ignav API 키를 확인해 주세요.',
      );
    case 402:
      return new SearchError(
        402,
        'Ignav 대시보드에서 무료 사용량과 결제 상태를 확인해 주세요.',
      );
    case 403:
      return new SearchError(
        502,
        'Ignav 계정의 이메일 인증과 API 접근 권한을 확인해 주세요.',
      );
    case 424:
      return new SearchError(
        424,
        code === 'unsupported_search'
          ? 'Ignav가 조회할 수 있는 날짜 범위를 벗어났어요. 더 가까운 날짜를 선택해 주세요.'
          : 'Ignav에서 이 조건의 항공편을 조회하지 못했어요. 날짜나 노선을 바꿔 다시 시도해 주세요.',
      );
    case 429:
      return new SearchError(
        429,
        'Ignav 조회 한도에 도달했어요. 대시보드에서 사용 한도를 확인해 주세요.',
      );
    case 503:
      return new SearchError(
        503,
        'Ignav 서비스가 일시적으로 혼잡해요. 잠시 후 다시 시도해 주세요.',
      );
    default:
      return new SearchError(
        502,
        'Ignav에서 항공편 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
  }
}

async function loadFares(apiKey, path, body) {
  const signal = AbortSignal.timeout(25_000);
  const timedOut = () =>
    new SearchError(
      504,
      'Ignav의 응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.',
    );
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
      signal,
    });
  } catch {
    if (signal.aborted) throw timedOut();
    throw new SearchError(
      502,
      'Ignav에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  }
  const data = await response.json().catch(() => null);
  if (signal.aborted) throw timedOut();
  if (!response.ok) {
    const code = data?.error?.code;
    if (response.status === 404 && code === 'itinerary_not_found') {
      return { itineraries: [], observed_at: null };
    }
    throw upstreamError(response.status, code);
  }
  if (!Array.isArray(data?.itineraries)) {
    throw new SearchError(502, 'Ignav에서 올바른 항공편 목록을 받지 못했어요.');
  }
  return {
    itineraries: data.itineraries,
    observed_at: observationTime(data.observed_at),
  };
}

export function ignavSearchPlugin(apiKey) {
  const cache = new Map();
  const inFlight = new Map();
  let usage = { day: '', count: 0 };

  async function findFares(path, body) {
    const key = `${path}:${JSON.stringify(body)}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.result;
    if (inFlight.has(key)) return inFlight.get(key);

    const day = todayInKorea();
    if (usage.day !== day) usage = { day, count: 0 };
    if (usage.count >= DAILY_LIMIT) {
      throw new SearchError(
        429,
        '오늘의 새 항공편 조회 횟수를 모두 사용했어요.',
      );
    }
    usage.count += 1;

    const pending = loadFares(apiKey, path, body);
    inFlight.set(key, pending);
    try {
      const result = await pending;
      cache.delete(key);
      cache.set(key, { result, expires: Date.now() + CACHE_TTL });
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
      return result;
    } finally {
      inFlight.delete(key);
    }
  }

  function install(server) {
    server.middlewares.use(SEARCH_ROUTE, async (req, res, next) => {
      if (req.url.split('?')[0] !== '/') return next();
      try {
        if (!localRequest(req))
          throw new SearchError(403, '로컬 앱에서 검색해 주세요.');
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          throw new SearchError(
            405,
            '항공편 검색은 POST 요청을 사용해 주세요.',
          );
        }
        const { path, body } = searchParameters(await readJson(req));
        if (!apiKey) {
          throw new SearchError(
            503,
            '서버의 IGNAV_API_KEY를 설정하고 앱을 다시 실행해 주세요.',
          );
        }
        sendJson(res, 200, await findFares(path, body));
      } catch (error) {
        req.resume();
        if (error instanceof SearchError) {
          sendJson(res, error.status, { error: error.message });
          return;
        }
        sendJson(res, 500, { error: '항공편 검색을 처리하지 못했어요.' });
      }
    });
  }

  return {
    name: 'ignav-search',
    configureServer: install,
    configurePreviewServer: install,
  };
}
