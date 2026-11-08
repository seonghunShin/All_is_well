import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { ignavSearchPlugin } from './ignav.js';

const sampleSearch = {
  trip: 'round',
  from: 'ICN',
  to: 'NRT',
  depart: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  returnDate: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
  passengers: '2',
  cabin: '비즈니스석',
};

function mountedSearch(plugin, hook = 'configureServer') {
  let route;
  plugin[hook]({
    middlewares: {
      use(path, handler) {
        assert.equal(path, '/api/flights/search');
        route = handler;
      },
    },
  });
  return async (body, headers = {}, chunks) => {
    const request = Readable.from(
      chunks ?? [Buffer.from(JSON.stringify(body))],
    );
    request.url = '/';
    request.method = 'POST';
    request.headers = {
      host: '127.0.0.1:5173',
      origin: 'http://127.0.0.1:5173',
      'content-type': 'application/json',
      ...headers,
    };
    request.socket = {};
    const response = {
      writeHead(status) {
        this.status = status;
      },
      end(data) {
        this.body = JSON.parse(data);
      },
    };
    await route(request, response, () =>
      assert.fail('Search route was skipped.'),
    );
    return { status: response.status, body: response.body };
  };
}

test('same round-trip request coalesces and sends one upstream request', async (t) => {
  const itineraries = [{ ignav_id: 'test-itinerary' }];
  const observed_at = '2026-11-08T10:05:27.123Z';
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://ignav.com/api/fares/round-trip');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['X-Api-Key'], 'test-key');
    assert.deepEqual(JSON.parse(init.body), {
      origin: 'ICN',
      destination: 'NRT',
      departure_date: sampleSearch.depart,
      return_date: sampleSearch.returnDate,
      adults: 2,
      cabin_class: 'business',
      market: 'KR',
    });
    return Response.json({ itineraries, observed_at, extra: 'not returned' });
  });
  const search = mountedSearch(ignavSearchPlugin('test-key'));
  const results = await Promise.all([
    search(sampleSearch),
    search(sampleSearch),
  ]);
  const expected = { status: 200, body: { itineraries, observed_at } };
  assert.deepEqual(results, [expected, expected]);
  assert.deepEqual(await search(sampleSearch), expected);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('unknown and invalid observation timestamps remain null', async (t) => {
  const timestamps = [undefined, null, '2026-02-30T10:05:27Z'];
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ itineraries: [], observed_at: timestamps.shift() }),
  );
  const search = mountedSearch(ignavSearchPlugin('test-key'));
  for (const passengers of [1, 2, 3]) {
    assert.deepEqual(await search({ ...sampleSearch, passengers }), {
      status: 200,
      body: { itineraries: [], observed_at: null },
    });
  }
});

test('nonstop and unrestricted searches are cached separately', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const { max_stops } = JSON.parse(init.body);
    assert.ok(max_stops === undefined || max_stops === 0);
    return Response.json({
      itineraries: [{ ignav_id: max_stops === 0 ? 'nonstop' : 'unrestricted' }],
    });
  });
  const search = mountedSearch(ignavSearchPlugin('test-key'));
  const request = { ...sampleSearch, trip: 'oneway', from: 'GMP', to: 'CJU' };
  const unrestricted = await search(request);
  const nonstop = await search({ ...request, direct: true });
  assert.deepEqual(unrestricted, {
    status: 200,
    body: { itineraries: [{ ignav_id: 'unrestricted' }], observed_at: null },
  });
  assert.deepEqual(nonstop, {
    status: 200,
    body: { itineraries: [{ ignav_id: 'nonstop' }], observed_at: null },
  });
  assert.deepEqual(await search({ ...request, direct: false }), unrestricted);
  assert.deepEqual(await search({ ...request, direct: true }), nonstop);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test('preview one-way route omits return date and reports a safe upstream error', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://ignav.com/api/fares/one-way');
    assert.equal(Object.hasOwn(JSON.parse(init.body), 'return_date'), false);
    return Response.json(
      { error: { code: 'unsupported_search', message: 'upstream details' } },
      { status: 424 },
    );
  });
  const search = mountedSearch(
    ignavSearchPlugin('test-key'),
    'configurePreviewServer',
  );
  const result = await search({ ...sampleSearch, trip: 'oneway' });
  assert.equal(result.status, 424);
  assert.match(result.body.error, /날짜 범위/);
});

test('invalid and cross-origin requests cannot consume Ignav credits', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('Invalid requests must not reach Ignav.');
  });
  const search = mountedSearch(ignavSearchPlugin('test-key'));
  assert.equal(
    (await search(sampleSearch, { origin: 'https://example.com' })).status,
    403,
  );
  assert.equal(
    (
      await search(sampleSearch, {
        host: 'example.com',
        origin: 'http://example.com',
      })
    ).status,
    403,
  );
  assert.equal(
    (await search(sampleSearch, { 'content-type': 'text/plain' })).status,
    415,
  );
  assert.equal(
    (await search(sampleSearch, {}, [Buffer.alloc(11 * 1024)])).status,
    413,
  );
  assert.equal(
    (await search({ ...sampleSearch, depart: '2027-02-30' })).status,
    400,
  );
  assert.equal(
    (await search({ ...sampleSearch, passengers: 1.5 })).status,
    400,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});
