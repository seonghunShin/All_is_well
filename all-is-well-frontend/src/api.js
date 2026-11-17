export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function requestJson(url, { method = 'GET', body, token, signal, keepalive, timeout = 12000 } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Queue-Token'] = token;
  const deadline = AbortSignal.timeout(timeout);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      keepalive,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(deadline.aborted ? '서버 응답이 늦어지고 있어요. 다시 시도해 주세요.' : '서버에 연결할 수 없어요.', 0, 'CONNECTION_ERROR');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || data.message || `요청에 실패했어요. (${response.status})`, response.status, data.code);
  }
  return data;
}
