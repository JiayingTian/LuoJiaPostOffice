// 明确切换模式，真实接口失败时绝不自动切换到演示数据。
export const config = Object.freeze({
  mode: 'demo', // 'demo' | 'api'
  apiBase: '/api/v1',
  pageSize: 6,
});
