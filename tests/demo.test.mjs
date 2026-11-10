import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoService } from '../frontend/demo.js';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('local draft survives reload, needs identity, and a sent public letter is visible to guests',async()=>{
  const storage=memory(),session=memory(),api=new DemoService(storage,session);
  await assert.rejects(api.save({}),e=>e.status===401);
  await api.login();const row=await api.save({title:'一封信',content:'还没有写完',saveAsDraft:true},{key:'key1'});
  const reload=new DemoService(storage,session);await reload.session();assert.equal((await reload.detail(row.id)).content,'还没有写完');
  const sent = await reload.save({ title: '一封信', content: '改好了', submitForReview: true }, { id: row.id });
  assert.equal(sent.status, 'active');
  assert.ok(sent.publishedAt);
  assert.ok((await reload.list()).items.some(letter => letter.id === row.id));
  await reload.logout();
  const guestView = await reload.detail(row.id);
  assert.equal(guestView.canEdit, false);
  assert.equal(guestView.canDelete, false);
  await assert.rejects(reload.remove(row.id), error => error.status === 401);
});
test('retry does not duplicate and storage failure is not a false success',async()=>{
  const api=new DemoService(memory(),memory());await api.login();
  const data={title:'标题',content:'内容',saveAsDraft:true};
  assert.equal((await api.save(data,{key:'same'})).id,(await api.save(data,{key:'same'})).id);
  assert.equal((await api.list({mine:true})).total,1);
  api.storage.setItem=()=>{throw Error('quota');};await assert.rejects(api.save(data,{key:'new'}),/未能保存/);
});
test('private demo stays personal, supports re-edit, and draft deletion persists',async()=>{
  const storage=memory(),session=memory(),api=new DemoService(storage,session);await api.login();
  const letter=await api.save({title:'给自己',content:'只给自己看的文字',visibility:'private',allowReplies:false,saveAsDraft:false},{key:'private'});
  assert.equal(letter.workflowState,'private');assert.equal(letter.submittedAt,null);assert.equal(letter.publishedAt,null);
  assert.ok(!(await api.list()).items.some(x=>x.id===letter.id));
  const draft=await api.save({title:'给自己',content:'修改',visibility:'private',submitForReview:false},{id:letter.id});
  assert.equal(draft.status,'draft');await api.remove(draft.id);await assert.rejects(api.detail(draft.id),e=>e.status===404);
  const reload=new DemoService(storage,session);await reload.session();assert.equal((await reload.list({mine:true})).total,0);
});

test('editing a published letter preserves content and identity, then returns to drafts', async()=>{
  const storage=memory(),api=new DemoService(storage,memory());await api.login();
  const row=await api.save({title:'已公开的信',content:'需要完整保留的原文',allowReplies:false,saveAsDraft:true},{key:'published'});
  storage.setItem('luojia.demo.letters.v1',JSON.stringify([{...row,status:'active',workflowState:'published',canEdit:false,publishedAt:'2026-10-20T00:00:00Z'}]));
  assert.equal((await api.detail(row.id)).canEdit, true);
  const changed=await api.save({title:row.title,submitForReview:false},{id:row.id});
  assert.equal(changed.id,row.id);assert.equal(changed.content,row.content);assert.equal(changed.allowReplies,false);
  assert.equal(changed.status,'draft');assert.equal(changed.publishedAt,null);assert.equal(changed.submittedAt,null);
  assert.equal((await api.list({mine:true,workflowState:'draft'})).total,1);
});


test('deleting a sent letter removes it from both lists without affecting sample letters', async () => {
  const api = new DemoService(memory(), memory());
  await api.login();
  const sent = await api.save({ title: '写好的信', content: '原文', saveAsDraft: false }, { key: 'sent' });
  assert.equal((await api.detail(sent.id)).canDelete, true);
  await assert.rejects(api.remove('let_demo_1'), error => error.status === 404);
  await api.remove(sent.id);
  await assert.rejects(api.detail(sent.id), error => error.status === 404);
  assert.equal((await api.list({ mine: true })).total, 0);
  assert.ok(!(await api.list()).items.some(letter => letter.id === sent.id));
});
