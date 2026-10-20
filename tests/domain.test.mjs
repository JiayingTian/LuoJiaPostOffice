import test from 'node:test';
import assert from 'node:assert/strict';
import { charCount, validateLetter, letterPayload, createSubmissionKey, statusLabel, escapeHTML } from '../frontend/domain.js';

const draft = { title:'一封信', content:'这是至少二十个字的一封信，写给校园里的朋友。', patternId:'pat_test', penName:'来客' };
test('Unicode code point length and limits match the contract', () => {
  assert.equal(charCount('你好😀'),3);
  assert.deepEqual(validateLetter(draft),{});
  assert.ok(validateLetter({...draft,content:'😀'.repeat(1501)}).content);
  assert.equal(validateLetter({...draft,content:'😀'.repeat(1500)}).content,undefined);
  assert.ok(validateLetter({...draft,title:'单'}).title);
});
test('empty and unfinished drafts are valid; sending still validates minimum lengths', () => {
  assert.deepEqual(validateLetter({...draft,title:'',content:'一句话'}, {draft:true}),{});
  assert.ok(validateLetter({...draft,title:'',content:'一句话'}).title);
  assert.deepEqual(validateLetter({...draft,title:'',content:'   '}, {draft:true}),{});
  assert.ok(validateLetter({...draft,content:' '.repeat(1501)}, {draft:true}).content);
  assert.equal(letterPayload({...draft,content:'  原文\n '},{draft:true}).content,'  原文\n ');
  assert.equal(statusLabel({status:'draft',workflowState:'returnedForEdit'}),'退回修改');
});
test('create/update payloads contain only declared fields', () => {
  const create=letterPayload({...draft,parentLetterId:'let_parent',id:'not-a-field',extra:'secret'},{draft:true});
  assert.equal(create.parentLetterId,'let_parent'); assert.equal(create.saveAsDraft,true); assert.ok(!('id' in create));
  const update=letterPayload({...draft,parentLetterId:'let_parent'},{update:true});
  assert.equal(update.submitForReview,true); assert.ok(!('parentLetterId' in update)); assert.ok(!('saveAsDraft' in update));
});
test('retry reuses key until content changes or submission completes', () => {
  let seq=0;const key=createSubmissionKey(()=>String(++seq));
  assert.equal(key.for(draft),key.for({...draft}));
  assert.notEqual(key.for(draft),key.for({...draft,title:'另一封信'}));
  const previous=key.for(draft);key.clear();assert.notEqual(key.for(draft),previous);
});
test('review labels use real backend states and safe fallback', () => {
  assert.equal(statusLabel({status:'active',visibility:'public',submittedAt:'now',publishedAt:null}),'待审核');
  assert.equal(statusLabel({status:'draft',reviewNote:'请修改'}),'退回修改');
  assert.equal(statusLabel({status:'future'}),'状态待确认');
});
test('letter text is escaped before rendering', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
