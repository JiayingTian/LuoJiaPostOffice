import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../frontend/api.js';
const success = data => new Response(JSON.stringify({code:0,data,requestId:'req_test'}),{headers:{'Content-Type':'application/json'}});

test('login sends exact fields; authenticated writes include cookie, csrf and idempotency',async()=>{
  const calls=[];
  const api=new ApiClient('/api/v1',async(url,options)=>{calls.push({url,options});return success(url.endsWith('/login')?{user:{id:'usr_a'},csrfToken:'csrf'}:{id:'let_a'});});
  await api.login({account:'alice',password:'12345678',ignored:'no'});
  assert.deepEqual(JSON.parse(calls[0].options.body),{account:'alice',password:'12345678'});
  assert.equal(calls[0].options.headers['X-CSRF-Token'],undefined);
  await api.save({title:'test'},{key:'uuid-retry'});
  assert.equal(calls[1].options.credentials,'include');assert.equal(calls[1].options.headers['X-CSRF-Token'],'csrf');
  assert.equal(calls[1].options.headers['Idempotency-Key'],'uuid-retry');
});
test('session restores user then memory-only CSRF token',async()=>{
  const calls=[];const api=new ApiClient('/api/v1',async url=>{calls.push(url);return success(url.endsWith('/csrf')?{csrfToken:'fresh'}:{id:'usr_a'});});
  await api.session();assert.deepEqual(calls,['/api/v1/auth/me','/api/v1/auth/csrf']);assert.equal(api.csrfToken,'fresh');
});
test('422 fields, request id and 429 retry delay are preserved',async()=>{
  const api=new ApiClient('/api/v1',async()=>new Response(JSON.stringify({code:42201,message:'字段错误',data:{fieldErrors:{title:'太短'}},requestId:'req_a'}),{status:422}));
  await assert.rejects(api.detail('x'),e=>e.fieldErrors.title==='太短'&&e.requestId==='req_a');
  api.fetcher=async()=>new Response(JSON.stringify({code:42901,message:'稍后再试'}),{status:429,headers:{'Retry-After':'8'}});
  await assert.rejects(api.list(),e=>e.retryAfter===8);
});
test('401 clears session but 403 does not; server errors never expose internal details',async()=>{
  const api=new ApiClient('/api/v1',async()=>new Response(JSON.stringify({code:40301,message:'无权限'}),{status:403}));
  api.user={id:'usr_a'};api.csrfToken='secret';await assert.rejects(api.detail('x'));assert.ok(api.user);
  api.fetcher=async()=>new Response(JSON.stringify({code:40101,message:'登录失效'}),{status:401});
  await assert.rejects(api.detail('x'));assert.equal(api.user,null);assert.equal(api.csrfToken,null);
  api.fetcher=async()=>new Response(JSON.stringify({code:50001,message:'database secret'}),{status:500});
  await assert.rejects(api.list(),e=>!e.message.includes('secret'));
});
test('network and malformed responses never fall back to demo success',async()=>{
  const api=new ApiClient('/api/v1',async()=>{throw Error('offline');});
  await assert.rejects(api.list(),/连接没有完成/);
  api.fetcher=async()=>new Response('<html>wrong server</html>');await assert.rejects(api.list(),/未返回可用数据/);
});

const failure = (status,code) => new Response(JSON.stringify({code,message:'请求失败'}),{status});
test('only CSRF 40302 refreshes once and replays exact body and key',async()=>{
  const calls=[];
  const api=new ApiClient('/api/v1',async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/csrf')) return success({csrfToken:'new'});
    return options.headers['X-CSRF-Token']==='old'?failure(403,40302):success({id:'saved'});
  });
  api.user={id:'a'};api.csrfToken='old';
  await api.save({title:'',content:'  保留空格  ',saveAsDraft:true},{key:'stable-key'});
  assert.equal(calls.length,3);assert.equal(calls[0].options.body,calls[2].options.body);
  assert.equal(calls[2].options.headers['Idempotency-Key'],'stable-key');
  api.csrfToken='old';calls.length=0;api.fetcher=async url=>{calls.push(url);return url.endsWith('/csrf')?success({csrfToken:'new'}):failure(403,40302);};
  await assert.rejects(api.save({},{key:'same'}));assert.equal(calls.length,3);
  calls.length=0;api.fetcher=async url=>{calls.push(url);return failure(403,40301);};
  await assert.rejects(api.save({}));assert.equal(calls.length,1);
});
test('CSRF refresh failure clears expired session without replay',async()=>{
  const calls=[];const api=new ApiClient('/api/v1',async url=>{calls.push(url);return url.endsWith('/csrf')?failure(401,40101):failure(403,40302);});
  api.user={id:'a'};api.csrfToken='old';await assert.rejects(api.save({}),e=>e.status===401);
  assert.equal(api.user,null);assert.equal(api.csrfToken,null);assert.equal(calls.length,2);
});
test('concurrent failed writes share one token recovery',async()=>{
  let recovery=0;const api=new ApiClient('/api/v1',async(url,options)=>{
    if(url.endsWith('/csrf')) {recovery++;await new Promise(resolve=>setTimeout(resolve,10));return success({csrfToken:'new'});}
    return options.headers['X-CSRF-Token']==='old'?failure(403,40302):success({id:'ok'});
  });api.user={id:'a'};api.csrfToken='old';await Promise.all([api.save({a:1},{key:'one'}),api.save({a:2},{key:'two'})]);assert.equal(recovery,1);
});
test('workflow filters, replies and review use declared paths and bodies',async()=>{
  const calls=[];const api=new ApiClient('/api/v1',async(url,options)=>{calls.push({url,options});return success({});});api.csrfToken='csrf';
  await api.list({mine:true,workflowState:'returnedForEdit'});assert.match(calls[0].url,/workflowState=returnedForEdit/);assert.ok(!calls[0].url.includes('&status='));
  await api.replies('let_a',{page:2});assert.match(calls[1].url,/letters\/let_a\/replies\?page=2/);
  await api.review('let_a','returnForEdit','请补充');assert.deepEqual(JSON.parse(calls[2].options.body),{action:'returnForEdit',reason:'请补充'});
});
