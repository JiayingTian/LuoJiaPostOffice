export class ApiError extends Error {
  constructor(message, { status = 0, code, fieldErrors = {}, requestId, retryAfter = 0 } = {}) {
    super(message); Object.assign(this, { status, code, fieldErrors, requestId, retryAfter });
  }
}

export class ApiClient {
  constructor(base, fetcher = globalThis.fetch.bind(globalThis)) {
    this.base = base.replace(/\/$/, ''); this.fetcher = fetcher;
    this.csrfToken = null; this.user = null;
  }
  async request(path, { method = 'GET', body, idempotencyKey, auth = true, retried = false } = {}) {
    const writing = !['GET', 'HEAD'].includes(method);
    if (writing && auth && !this.csrfToken && this.user) await this.refreshCsrf();
    if (writing && auth && !this.csrfToken) {
      throw new ApiError('请重新登录后继续，已经写下的内容会保留。', { status: 401, code: 'SESSION_REAUTH' });
    }
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (writing && auth) headers['X-CSRF-Token'] = this.csrfToken;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let response;
    try {
      response = await this.fetcher(`${this.base}${path}`, {
        method, headers, credentials: 'include',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new ApiError('连接没有完成，请检查网络后重试。内容仍在当前页面。');
    }
    let result;
    try { result = await response.json(); }
    catch { throw new ApiError('服务暂时未返回可用数据，请稍后重试。', { status: response.status }); }
    if (!response.ok || result.code !== 0) {
      if (writing && auth && response.status === 403 && result.code === 40302 && !retried) {
        // 只重试明确的 CSRF 错误；并发请求共用恢复，保持请求体与幂等键。
        if (this.csrfToken === headers['X-CSRF-Token']) await this.refreshCsrf();
        return this.request(path, { method, body, idempotencyKey, auth, retried: true });
      }
      if (response.status === 401) { this.user = null; this.csrfToken = null; }
      const retry = response.headers.get('Retry-After');
      const retryAfter = /^\d+$/.test(retry || '') ? Number(retry) : Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000)) || 0;
      throw new ApiError(response.status >= 500 ? '服务暂时不可用，请稍后重试。' : (result.message || '操作没有完成，请重试。'), {
        status: response.status, code: result.code, fieldErrors: result.data?.fieldErrors || {},
        requestId: result.requestId || response.headers.get('X-Request-Id'), retryAfter,
      });
    }
    return result.data;
  }
  async refreshCsrf() {
    if (!this.csrfRefresh) {
      this.csrfRefresh = this.request('/auth/csrf').then(data => {
        if (!data?.csrfToken) throw new ApiError('登录验证信息不完整，请稍后重试。');
        this.csrfToken = data.csrfToken;
        return this.csrfToken;
      }).finally(() => { this.csrfRefresh = null; });
    }
    return this.csrfRefresh;
  }
  async session() {
    try { this.user = await this.request('/auth/me'); await this.refreshCsrf(); return this.user; }
    catch (error) { if (error.status === 401) return null; throw error; }
  }
  async login({ account, password }) {
    const data = await this.request('/auth/login', { method: 'POST', body: { account, password }, auth: false });
    this.user = data.user; this.csrfToken = data.csrfToken; return this.user;
  }
  async register({ username, password, displayName }) {
    const data = await this.request('/auth/register', { method: 'POST', body: { username, password, displayName }, auth: false });
    this.user = data.user; this.csrfToken = data.csrfToken; return this.user;
  }
  async logout() { await this.request('/auth/logout', { method: 'POST' }); this.user = null; this.csrfToken = null; }
  metadata() { return this.request('/metadata'); }
  list({ mine = false, page = 1, pageSize = 6, drafts = false, workflowState } = {}) {
    const query = new URLSearchParams({ page, pageSize });
    if (mine && (workflowState || drafts)) query.set('workflowState', workflowState || 'draft');
    if (!mine) query.set('sort', 'latest');
    return this.request(`${mine ? '/me/letters' : '/letters'}?${query}`);
  }
  detail(id) { return this.request(`/letters/${encodeURIComponent(id)}`); }
  replies(id, { page = 1, pageSize = 6 } = {}) {
    return this.request(`/letters/${encodeURIComponent(id)}/replies?${new URLSearchParams({ page, pageSize })}`);
  }
  reviewQueue({ page = 1, pageSize = 6 } = {}) {
    return this.request(`/admin/letters?${new URLSearchParams({ page, pageSize })}`);
  }
  review(id, action, reason) {
    return this.request(`/admin/letters/${encodeURIComponent(id)}/review`, { method: 'POST', body: { action, ...(reason ? { reason } : {}) } });
  }
  save(payload, { id, key } = {}) {
    return this.request(id ? `/letters/${encodeURIComponent(id)}` : '/letters', {
      method: id ? 'PATCH' : 'POST', body: payload, idempotencyKey: id ? undefined : key,
    });
  }
}
