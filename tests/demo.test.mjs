import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoService } from '../frontend/demo.js';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('local draft survives reload, needs identity, and simulated submission stays out of public list',async()=>{
  const storage=memory(),session=memory(),api=new DemoService(storage,session);
  await assert.rejects(api.save({}),e=>e.status===401);
  await api.login();const row=await api.save({title:'一封信',content:'还没有写完',saveAsDraft:true},{key:'key1'});
  const reload=new DemoService(storage,session);await reload.session();assert.equal((await reload.detail(row.id)).content,'还没有写完');
  const pending=await reload.save({title:'一封信',content:'改好了',submitForReview:true},{id:row.id});
  assert.equal(pending.status,'active');assert.equal(pending.publishedAt,null);
  assert.ok(!(await reload.list()).items.some(r=>r.id===row.id));
  await reload.logout();await assert.rejects(reload.detail(row.id),e=>e.status===404);
});
test('retry does not duplicate and storage failure is not a false success',async()=>{
  const api=new DemoService(memory(),memory());await api.login();
  const data={title:'标题',content:'内容',saveAsDraft:true};
  assert.equal((await api.save(data,{key:'same'})).id,(await api.save(data,{key:'same'})).id);
  assert.equal((await api.list({mine:true})).total,1);
  api.storage.setItem=()=>{throw Error('quota');};await assert.rejects(api.save(data,{key:'new'}),/未能保存/);
});
