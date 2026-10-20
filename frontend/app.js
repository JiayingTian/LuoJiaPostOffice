import { config } from './config.js';
import { ApiClient } from './api.js';
import { DemoService } from './demo.js';
import { escapeHTML as e, charCount, statusLabel, validateLetter, letterPayload, createSubmissionKey } from './domain.js';

const demo = config.mode === 'demo';
const service = demo ? new DemoService() : new ApiClient(config.apiBase);
const app = document.querySelector('#app');
const dialog = document.querySelector('#auth-dialog');
const state = { editor: null, dirty: false, metadata: null, busy: false, render: 0, list: '#/mailbox', positions: new Map(), selected: null, register: false };
const submission = createSubmissionKey();
let toastTimer, cooldownUntil = 0;
const route = () => {
  const [path, query] = (location.hash.slice(1) || '/mailbox').split('?');
  return { path, params: new URLSearchParams(query) };
};
const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(value)) : '日期待确认';
const empty = (title, text, action = '') => `<section class="empty"><h2>${e(title)}</h2><p>${e(text)}</p>${action}</section>`;
const button = (text, action, primary = false) => `<button type="button" class="button ${primary ? 'primary' : ''}" data-action="${action}">${text}</button>`;
const ownEditor = () => ({ id: null, title: '', content: '', penName: '', isAnonymous: false, patternId: state.metadata?.patterns[0]?.id || '', parentLetterId: null, parentTitle: '', visibility: 'public', allowReplies: true });

const modeNote = document.querySelector('#mode-note');
if (demo) {
  modeNote.innerHTML = '<strong>交互预览 · 本机演示</strong>　示例信件仅供试用；保存和模拟提交只保存在此浏览器，不会发送到服务器。';
} else {
  modeNote.hidden = true;
}

function toast(message) {
  const box = document.querySelector('#toast'); box.textContent = message; box.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.remove('visible'), 4200);
}
function updateAccount() {
  document.querySelector('#user-name').textContent = service.user?.displayName || '';
  document.querySelector('#account-button').textContent = '登录';
  document.querySelector('#account-button').hidden = Boolean(service.user);
  document.querySelector('[data-nav=admin]').hidden = service.user?.role !== 'admin';
}
function navigate(hash) { if (hash === location.hash) render(); else location.hash = hash; }
function errorText(error, { includeRequestId = true } = {}) {
  if (error.status === 429) { cooldownUntil = Date.now() + Math.max(error.retryAfter || 30, 1) * 1000; return `操作较频繁，请 ${Math.ceil((cooldownUntil-Date.now())/1000)} 秒后再试。`; }
  return `${error.message || '操作未完成，请稍后重试。'}${includeRequestId && error.requestId ? `（编号 ${error.requestId}）` : ''}`;
}
function canRequest() {
  if (Date.now() < cooldownUntil) { toast(`请 ${Math.ceil((cooldownUntil-Date.now())/1000)} 秒后再试。`); return false; }
  return true;
}
function showError(error) {
  const box = app.querySelector('.form-error');
  if (box) box.textContent = errorText(error); else toast(errorText(error));
  for (const [key, value] of Object.entries(error.fieldErrors || {})) {
    const element = [...app.querySelectorAll('[data-error]')].find(el => el.dataset.error === key);
    if (element) element.textContent = value;
  }
  if (error.status === 401) { updateAccount(); openAuth(); }
}
function setBusy(value) {
  state.busy = value;
  app.querySelectorAll('[data-mutate]').forEach(el => { el.disabled = value; el.setAttribute('aria-busy', String(value)); });
  app.querySelectorAll('#editor input, #editor textarea, #editor select').forEach(el => { el.disabled = value || (el.name === 'allowReplies' && state.editor?.visibility === 'private'); });
}
function authNeeded() {
  if (!service.user) { openAuth(); return true; }
  return false;
}
async function metadata() {
  if (!state.metadata) state.metadata = await service.metadata();
  if (!state.metadata.patterns?.length) throw new Error('暂时没有可用信纸，请稍后重试。');
  return state.metadata;
}
function titleBlock(title, intro, action = '') {
  return `<div class="breadcrumbs"><a href="../index.html">首页 / 信箱</a><a href="../index.html">返回首页 ↗</a></div><div class="page-heading"><div><p class="eyebrow">LETTERS FROM LUOJIA</p><h1>${title}</h1><p class="intro">${intro}</p></div>${action}</div>`;
}
function card(letter, mine) {
  return `<button class="envelope ${matchMedia('(hover: none)').matches && state.selected === letter.id ? 'revealed' : ''}" type="button" data-letter="${e(letter.id)}" aria-label="${e(letter.title || '未命名草稿')}，按 Enter 阅读全文" aria-describedby="summary-${e(letter.id)}">
    ${mine ? `<span class="badge">${e(statusLabel(letter))}</span>` : ''}
    <span class="envelope-title">${e(letter.title || '未命名草稿')}</span><span class="envelope-excerpt" id="summary-${e(letter.id)}">${e(letter.excerpt || '这封信还在慢慢写。')}</span>
    <span class="envelope-meta">${e(letter.author?.displayName || '匿名来客')}<br>${e(letter.publishedAt ? date(letter.publishedAt) : letter.visibility === 'private' ? '仅自己可见' : '尚未公开')}</span><span class="stamp" aria-hidden="true">珞</span>
  </button>`;
}
async function mailbox(params, mine, token) {
  const page = Math.max(1, Number(params.get('page')) || 1), workflowState = ['draft','pendingReview','published',...(demo ? ['private'] : [])].includes(params.get('filter')) ? params.get('filter') : '';
  if (mine && !service.user) {
    app.innerHTML = empty('你的信，都在这里', '登录后查看自己保存的草稿和提交的信件。', button('登录', 'login', true)); return;
  }
  app.innerHTML = titleBlock(mine ? '我的信件' : '公共来信', mine ? '还未寄出的心事，也值得好好保存。' : '读一封信，遇见另一段日常。', '<a class="button primary" href="#/write">写一封信</a>') + '<div class="letter-grid" aria-label="正在加载">' + '<div class="skeleton"></div>'.repeat(6) + '</div>';
  const result = await service.list({ mine, workflowState, page, pageSize: config.pageSize });
  if (token !== state.render) return;
  const base = mine ? '/mine' : '/mailbox';
  const paging = p => `#${base}?page=${p}${workflowState ? `&filter=${workflowState}` : ''}`;
  const tabs = mine ? `<div class="tabs">${[['','全部信件'],['draft','草稿箱'],['pendingReview','待审核'],['published','已公开'],...(demo ? [['private','仅自己可见']] : [])].map(([value,label]) => `<a href="#/mine${value ? `?filter=${value}` : ''}" class="${workflowState === value ? 'active' : ''}">${label}</a>`).join('')}</div>` : '';
  app.innerHTML = titleBlock(mine ? '我的信件' : '公共来信', mine ? '还未寄出的心事，也值得好好保存。' : '读一封信，遇见另一段日常。', '<a class="button primary" href="#/write">写一封信</a>') + tabs +
    `<div class="section-label"><span>${mine ? '我的信笺' : '最新来信'}</span><span>共 ${Number(result.total) || 0} 封</span></div>` +
    (result.items.length ? `<div class="letter-grid">${result.items.map(item => card(item, mine)).join('')}</div>` : empty(mine ? '这里还没有信' : '信箱暂时安静', mine ? '把今天想说的话写下来吧。' : '第一封来信正在路上。')) +
    `<nav class="pagination" aria-label="翻页">${page > 1 ? `<a class="button" href="${paging(page - 1)}">上一页</a>` : ''}<span>第 ${page} 页</span>${result.hasMore ? `<a class="button" href="${paging(page + 1)}">下一页</a>` : ''}</nav>`;
  state.list = location.hash || '#/mailbox';
  requestAnimationFrame(() => window.scrollTo(0, state.positions.get(state.list) || 0));
}
function paper(letter, preview = false) {
  return `<article class="paper"><p class="eyebrow">A LETTER FOR YOU</p>${letter.parentLetterId ? `<p class="parent-note">回信${letter.parentTitle ? ` · ${e(letter.parentTitle)}` : ''}${!preview ? `　<a href="#/letter/${encodeURIComponent(letter.parentLetterId)}">查看原信</a>` : ''}</p>` : ''}
  <h1>${e(letter.title || '未命名草稿')}</h1><div class="letter-meta"><span>${e(letter.author?.displayName || '匿名来客')}</span>${!preview ? `<span>${e(date(letter.publishedAt || letter.updatedAt || letter.createdAt))}</span><span class="badge">${e(statusLabel(letter))}</span>` : `<span>${letter.visibility === 'private' ? '仅自己可见 · 不公开' : '寄往公共信箱 · 审核后公开'}</span>`}</div>
  <div class="letter-content">${e(letter.content)}</div><p class="letter-signature">${e(letter.author?.displayName || '匿名来客')}</p>`;
}
async function detail(id, token, params) {
  app.innerHTML = empty('正在取信', '请稍等片刻。');
  const letter = await service.detail(id);
  if (token !== state.render) return;
  state.currentLetter = letter;
  app.innerHTML = `<div class="breadcrumbs"><a href="${e(state.list)}">← 返回信箱</a></div>` + paper(letter) +
    `<div class="actions">${letter.canEdit ? button(letter.publishedAt ? '再次编辑' : '继续写信', 'edit', true) : ''}${letter.status === 'draft' && letter.canDelete ? button('删除草稿', 'delete-draft') : ''}${letter.status === 'active' && letter.publishedAt && !letter.parentLetterId && letter.allowReplies === true ? button('回一封信', 'reply', true) : ''}</div></article>`;
  if (!demo && service.user?.role === 'admin' && letter.status === 'active' && letter.visibility === 'public' && !letter.publishedAt && letter.submittedAt) {
    app.insertAdjacentHTML('beforeend', `<section class="paper review-panel"><h2>审核这封信</h2><p class="form-error" role="alert"></p><div class="actions">${button('审核通过','approve-review',true)}</div></section>`);
    app.querySelectorAll('.review-panel button').forEach(el => el.dataset.mutate = '');
  }
  if (letter.status === 'active' && letter.publishedAt && !letter.parentLetterId) {
    const page = Math.max(1, Number(params.get('replyPage')) || 1);
    app.insertAdjacentHTML('beforeend', '<section class="replies"><h2>回信</h2><div id="reply-list" aria-live="polite">正在取回信……</div></section>');
    try {
      const result = await service.replies(id, { page, pageSize: config.pageSize });
      if (token !== state.render) return;
      const href = p => `#/letter/${encodeURIComponent(id)}?replyPage=${p}`;
      app.querySelector('#reply-list').innerHTML = (result.items.length ? `<div class="letter-grid">${result.items.map(item => card(item, false)).join('')}</div>` : '<p class="help">还没有公开的回信。</p>') +
        `<nav class="pagination">${page > 1 ? `<a class="button" href="${href(page-1)}">上一页回信</a>` : ''}${result.hasMore ? `<a class="button" href="${href(page+1)}">下一页回信</a>` : ''}</nav>`;
    } catch (error) {
      if (token === state.render) app.querySelector('#reply-list').innerHTML = `<p class="form-error">${e(errorText(error))}</p>${button('重试','retry')}`;
    }
  }
}
async function reviewQueue(params, token) {
  if (!service.user) { app.innerHTML = empty('审核工作台', '请使用管理员账号登录。', button('登录','login',true)); return; }
  if (demo || service.user.role !== 'admin') { app.innerHTML = empty('无法进入审核工作台', '此入口仅供管理员使用。'); return; }
  app.innerHTML = empty('正在读取待审核信件', '请稍等片刻。');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const result = await service.reviewQueue({ page, pageSize: config.pageSize });
  if (token !== state.render) return;
  state.list = location.hash;
  app.innerHTML = titleBlock('待审核信件','审核通过后，其他人才能读到这封信。') +
    (result.items.length ? `<div class="letter-grid">${result.items.map(item => card(item,true)).join('')}</div>` : empty('暂时没有待审核信件','可以稍后再来看看。')) +
    `<nav class="pagination">${page > 1 ? `<a class="button" href="#/admin?page=${page-1}">上一页</a>` : ''}${result.hasMore ? `<a class="button" href="#/admin?page=${page+1}">下一页</a>` : ''}</nav>`;
}
async function reviewLetter() {
  if (state.busy || !canRequest() || authNeeded()) return;
  setBusy(true);
  try {
    await service.review(state.currentLetter.id, 'approve');
    toast('审核已通过。');
    navigate('#/admin');
  } catch (error) { showError(error); }
  finally { setBusy(false); }
}
async function write(token) {
  app.innerHTML = empty('正在铺开信纸', '请稍等片刻。');
  await metadata();
  if (token !== state.render) return;
  state.editor ||= ownEditor();
  state.editor.patternId ||= state.metadata.patterns[0].id;
  const value = state.editor;
  app.innerHTML = `<div class="breadcrumbs"><a href="${e(state.list)}">← 返回信箱</a><span>${value.id ? '继续写草稿' : '写一封信'}</span></div><form id="editor" class="paper" novalidate><p class="eyebrow">WORDS WORTH KEEPING</p><h1>写下此刻的心事</h1>
    ${value.parentLetterId ? `<p class="parent-note">回信 · ${e(value.parentTitle || '原信')}</p>` : ''}
    <div class="form-field"><label for="letter-title">标题</label><input id="letter-title" name="title" value="${e(value.title)}" autocomplete="off" aria-describedby="title-error"><div class="field-error" id="title-error" data-error="title"></div></div>
    <div class="form-field"><label for="letter-content">正文</label><textarea id="letter-content" name="content" placeholder="见字如面……" aria-describedby="content-error">${e(value.content)}</textarea><div class="form-meta"><span id="word-count">${charCount(value.content)} / 2000</span></div><div class="field-error" id="content-error" data-error="content"></div></div>
    <div class="signature-row"><div class="form-field"><label for="pen-name">署名</label><input id="pen-name" name="penName" value="${e(value.penName)}" autocomplete="off"><div class="field-error" data-error="penName"></div></div>
    <label class="check-label"><input type="checkbox" name="isAnonymous" ${value.isAnonymous ? 'checked' : ''}> 匿名展示</label></div>
    <fieldset class="letter-settings"><legend>这封信的设置</legend>
      <div class="form-field"><label for="visibility">谁可以看这封信</label><select id="visibility" name="visibility"><option value="public" ${value.visibility !== 'private' ? 'selected' : ''}>公开 · 与人分享</option><option value="private" ${value.visibility === 'private' ? 'selected' : ''} ${demo ? '' : 'disabled'}>私密 · 仅自己可见${demo ? '' : '（暂不可用）'}</option></select></div>
      <label class="check-label"><input type="checkbox" name="allowReplies" ${value.visibility !== 'private' && value.allowReplies !== false ? 'checked' : ''} ${value.visibility === 'private' ? 'disabled' : ''}> 允许别人回信</label><p class="help" id="reply-setting-note">${value.visibility === 'private' ? '私密信件只留给自己，不接收别人的回信。' : '关闭后，别人仍能阅读公开信件，但不能给它写回信。'}</p>
    </fieldset>
    <p class="saved-note" role="status"></p><p class="form-error" role="alert"></p>
    <div class="actions"><button type="button" class="button" data-action="save" data-mutate>保存草稿</button><button type="submit" class="button primary" data-mutate>预览下一步</button></div></form>`;
  setBusy(state.busy);
}
function preview() {
  if (!state.editor) { navigate('#/write'); return; }
  const letter = state.editor;
  app.innerHTML = `<div class="breadcrumbs"><a href="#/write" data-continue>← 返回修改</a><span>寄出前，再读一遍</span></div>` + paper({ ...letter, author: { displayName: letter.isAnonymous ? '匿名来客' : letter.penName || service.user?.displayName || '珞珈来客' } }, true) +
    `<p class="help">${letter.visibility === 'private' ? '这封信仅在本机演示中保存为私密，不会寄到公共信箱。' : demo ? '此处只模拟提交，并在本机显示待审核。不会真实寄出或公开。' : '提交后等待管理员审核，通过后所有访客都可以阅读。'}</p><p class="form-error" role="alert"></p><div class="actions"><a href="#/write" class="button" data-continue>返回修改</a><button type="button" class="button primary" data-action="submit" data-mutate>${letter.visibility === 'private' ? '保存为私密信件' : demo ? '模拟提交审核' : '确认寄出'}</button></div></article>`;
}
async function render() {
  renderedHash = location.hash || '#/mailbox';
  const token = ++state.render;
  const { path, params } = route();
  document.querySelectorAll('[data-nav]').forEach(el => {
    if (path.startsWith('/' + el.dataset.nav)) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  try {
    if (path === '/mailbox' || path === '/mine') await mailbox(params, path === '/mine', token);
    else if (path.startsWith('/letter/')) await detail(decodeURIComponent(path.slice(8)), token, params);
    else if (path === '/admin') await reviewQueue(params, token);
    else if (path === '/write') await write(token);
    else if (path === '/preview') preview();
    else app.innerHTML = empty('这条路暂时没有信', '回到信箱继续看看吧。', '<a class="button" href="#/mailbox">返回信箱</a>');
  } catch (error) {
    if (token !== state.render) return;
    app.innerHTML = empty(error.status === 404 ? '这封信暂时无法查看' : '暂时没有取到信', errorText(error), button('重试', 'retry') + ' <a class="button" href="#/mailbox">返回信箱</a>');
    if (error.status === 401) { updateAccount(); openAuth(); }
  }
}
function validate(draft) {
  const errors = validateLetter(state.editor, { draft });
  app.querySelectorAll('[data-error]').forEach(el => { el.textContent = errors[el.dataset.error] || ''; });
  app.querySelectorAll('[name]').forEach(el => el.setAttribute('aria-invalid', String(Boolean(errors[el.name]))));
  if (Object.keys(errors).length) {
    app.querySelector('[aria-invalid=true]')?.focus();
    if (!app.querySelector('[data-error]')) toast(Object.values(errors)[0]);
    return false;
  }
  return true;
}
async function save(draft) {
  if (state.busy || !state.editor || !canRequest() || !validate(draft) || authNeeded()) return false;
  if (!demo && state.editor.visibility === 'private') { showError(new Error('仅自己可见暂不可用，未发送任何内容。')); return false; }
  setBusy(true);
  const payload = letterPayload(state.editor, { draft, update: Boolean(state.editor.id), privateEnabled: demo });
  try {
    const letter = await service.save(payload, { id: state.editor.id, key: submission.for(payload) });
    state.dirty = false; submission.clear();
    if (draft) {
      state.editor.id = letter.id;
      const message = demo ? '草稿已保存在此浏览器。' : '草稿已保存。';
      const note = app.querySelector('.saved-note'); if (note) note.textContent = message;
      toast(message);
    } else {
      state.editor = null;
      toast(payload.visibility === 'private' ? '私密信件已保存在此浏览器。' : demo ? '已在本机模拟提交，未发送到服务器。' : '已提交，等待审核。');
      navigate('#/mine');
    }
    return true;
  } catch (error) { showError(error); return false; }
  finally { setBusy(false); }
}
async function startFrom(letter, edit) {
  if (state.busy) { toast('正在保存，请稍等片刻。'); return; }
  if (state.dirty) { await requestLeave(() => startFrom(letter, edit)); return; }
  await metadata();
  if (edit && letter.publishedAt && letter.visibility === 'public') {
    if (leaving) return;
    leaving = true;
    try {
      const choice = await choose('收回草稿箱，再继续写？', '确认后，这封信将不再公开，已保存的正文会保留。修改完成后，可重新提交审核。', [['cancel','取消'],['edit','收回并编辑',true]]);
      if (choice !== 'edit') return;
      setBusy(true);
      letter = await service.save({ title: letter.title, submitForReview: false }, { id: letter.id });
      state.currentLetter = letter;
    } finally { setBusy(false); leaving = false; }
  }
  state.editor = edit ? { id: letter.id, title: letter.title, content: letter.content, penName: letter.author?.isAnonymous ? '' : letter.author?.displayName || '', isAnonymous: Boolean(letter.author?.isAnonymous), patternId: letter.pattern.id, parentLetterId: letter.parentLetterId, parentTitle: '', visibility: letter.visibility || 'public', allowReplies: letter.allowReplies, allowResponses: letter.allowResponses }
    : { ...ownEditor(), parentLetterId: letter.id, parentTitle: letter.title };
  state.dirty = false; submission.clear(); navigate('#/write');
}

app.addEventListener('input', event => {
  if (!event.target.closest('#editor') || !state.editor) return;
  const input = event.target;
  state.editor[input.name] = input.type === 'checkbox' ? input.checked : input.value;
  input.removeAttribute('aria-invalid');
  const error = [...app.querySelectorAll('[data-error]')].find(el => el.dataset.error === input.name);
  if (error) error.textContent = '';
  state.dirty = true;
  if (input.name === 'visibility') {
    const control = app.querySelector('[name=allowReplies]');
    control.disabled = input.value === 'private';
    control.checked = input.value !== 'private' && state.editor.allowReplies !== false;
    app.querySelector('#reply-setting-note').textContent = input.value === 'private' ? '私密信件只留给自己，不接收别人的回信。' : '关闭后，别人仍能阅读公开信件，但不能给它写回信。';
  }
  app.querySelector('#word-count').textContent = `${charCount(state.editor.content)} / 2000`;
  app.querySelector('.saved-note').textContent = '有尚未保存的修改';
});
app.addEventListener('submit', event => {
  if (event.target.id !== 'editor') return;
  event.preventDefault(); if (validate(false)) navigate('#/preview');
});
app.addEventListener('click', async event => {
  const envelope = event.target.closest('[data-letter]');
  if (envelope) {
    app.querySelectorAll('.revealed').forEach(el => el.classList.remove('revealed'));
    state.selected = envelope.dataset.letter;
    if (matchMedia('(hover: none)').matches) envelope.classList.add('revealed');
    return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  try {
    if (action === 'login') openAuth();
    if (action === 'retry' && canRequest()) render();
    if (action === 'delete-draft') await deleteDraft();
    if (action === 'save') await save(true);
    if (action === 'submit') await save(false);
    if (action === 'reply') await startFrom(state.currentLetter, false);
    if (action === 'edit') await startFrom(state.currentLetter, true);
    if (action === 'approve-review') await reviewLetter();
  } catch (error) { showError(error); }
  if (!action && !event.target.closest('a,button,input,textarea')) {
    state.selected = null; app.querySelectorAll('.revealed').forEach(el => el.classList.remove('revealed'));
  }
});
function openLetter(element) {
  state.positions.set(location.hash || '#/mailbox', window.scrollY);
  state.selected = element.dataset.letter;
  navigate(`#/letter/${encodeURIComponent(element.dataset.letter)}`);
}
app.addEventListener('dblclick', event => { const card = event.target.closest('[data-letter]'); if (card) openLetter(card); });
app.addEventListener('keydown', event => {
  const card = event.target.closest('[data-letter]');
  if (card && event.key === 'Enter') { event.preventDefault(); openLetter(card); }
  if (event.key === 'Escape') { state.selected = null; app.querySelectorAll('.revealed').forEach(el => el.classList.remove('revealed')); }
});
let lastTouch;
app.addEventListener('pointerup', event => {
  if (event.pointerType !== 'touch') return;
  const card = event.target.closest('[data-letter]'); if (!card) return;
  const now = performance.now();
  if (lastTouch?.id === card.dataset.letter && now - lastTouch.time < 380) { openLetter(card); lastTouch = null; }
  else lastTouch = { id: card.dataset.letter, time: now };
});

function openAuth() {
  document.querySelector('#auth-body').innerHTML = demo
    ? '<p>当前是本机交互演示。使用演示身份即可测试保存和模拟提交，无需输入真实账号或密码。</p><button class="button primary" data-demo-login type="button">使用演示身份</button><p class="form-error" role="alert"></p>'
    : `<form id="auth-form"><p class="help">${service.user ? '为继续当前操作，请重新验证登录。内容会保留。' : '登录后继续保存或寄信。'}</p><div class="form-field"><label for="account">用户名</label><input id="account" name="account" required minlength="3" maxlength="32" autocomplete="username" pattern="${state.register ? '[a-z0-9_]+' : '[A-Za-z0-9_]+'}">${state.register ? '<p class="help">仅支持英文小写字母、数字和下划线（_）。</p>' : ''}</div>${state.register ? '<div class="form-field"><label for="display-name">显示名称</label><input id="display-name" name="displayName" required maxlength="30" autocomplete="nickname"></div>' : ''}<div class="form-field"><label for="password">密码</label><input id="password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="${state.register ? 'new-password' : 'current-password'}"></div><p class="form-error" role="alert"></p><div class="dialog-actions"><button class="text-button" type="button" data-auth-switch>${state.register ? '已有账号，去登录' : '还没有账号？注册'}</button><button class="button primary" type="submit">${state.register ? '注册' : '登录'}</button></div></form>`;
  if (!dialog.open) dialog.showModal();
}
async function authenticate(action) {
  if (!canRequest() || dialog.dataset.busy === 'true') return;
  dialog.dataset.busy = 'true'; dialog.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await action(); dialog.close(); document.querySelector('#auth-body').innerHTML = ''; updateAccount(); if (route().path !== '/write') await render(); toast('已登录，可以继续刚才的操作。'); }
  catch (error) {
    const invalidCredentials = !state.register && error.status === 401;
    dialog.querySelector('.form-error').textContent = errorText(error, {
      includeRequestId: !invalidCredentials,
    });
  }
  finally { dialog.dataset.busy = 'false'; dialog.querySelectorAll('button').forEach(b => b.disabled = false); }
}
dialog.addEventListener('click', event => {
  if (event.target.closest('.dialog-close')) dialog.close();
  if (event.target.closest('[data-auth-switch]')) { state.register = !state.register; openAuth(); }
  if (event.target.closest('[data-demo-login]')) authenticate(() => service.login());
});
dialog.addEventListener('submit', event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
  authenticate(() => state.register ? service.register({ username: data.account.toLowerCase(), password: data.password, displayName: data.displayName }) : service.login({ account: data.account.toLowerCase(), password: data.password }));
});
document.querySelector('#account-button').addEventListener('click', () => { if (!service.user) openAuth(); });

let renderedHash = location.hash || '#/mailbox';
let leaving = false;
const isEditorRoute = hash => ['/write','/preview'].includes(hash.replace(/^#/, '').split('?')[0]);
function choose(title, message, options) {
  const modal = document.querySelector('#choice-dialog');
  modal.innerHTML = `<h2 id="choice-title">${title}</h2><p>${message}</p><div class="dialog-actions">${options.map(([value,label,primary]) => `<button type="button" class="button ${primary ? 'primary' : ''}" data-choice="${value}">${label}</button>`).join('')}</div>`;
  return new Promise(resolve => {
    const finish = value => { modal.removeEventListener('click', click); modal.removeEventListener('cancel', cancel); modal.close(); resolve(value); };
    const click = event => { const value = event.target.closest('[data-choice]')?.dataset.choice; if (value) finish(value); };
    const cancel = event => { event.preventDefault(); finish('cancel'); };
    modal.addEventListener('click', click); modal.addEventListener('cancel', cancel); modal.showModal();
    modal.querySelector('[data-choice=cancel]')?.focus();
  });
}
async function requestLeave(action) {
  if (leaving || state.busy) return;
  if (!state.dirty) { await action(); return; }
  leaving = true;
  try {
    const choice = await choose('这封信还没有保存', '离开前，要先保存草稿吗？暂不保存将离开此页，本次未保存的修改不会保留。', [['save','保存',true],['discard','暂不保存'],['cancel','继续编辑']]);
    if (choice === 'cancel') return;
    if (choice === 'save' && !await save(true)) return;
    state.dirty = false; state.editor = null; submission.clear();
    await action();
  } finally { leaving = false; }
}
async function deleteDraft() {
  if (state.busy || leaving) return;
  const letter = state.currentLetter;
  if (!letter || letter.status !== 'draft' || !letter.canDelete) return;
  leaving = true;
  try {
    const choice = await choose('删除这封草稿？', '删除后，这封草稿将不再保留。', [['cancel','取消'],['delete','删除',true]]);
    if (choice !== 'delete') return;
    setBusy(true);
    await service.remove(letter.id);
    if (state.editor?.id === letter.id) { state.editor = null; state.dirty = false; }
    toast('草稿已删除。'); navigate('#/mine');
  } catch (error) { showError(error); }
  finally { setBusy(false); leaving = false; }
}
window.addEventListener('hashchange', () => {
  const target = location.hash || '#/mailbox';
  if (state.dirty && isEditorRoute(renderedHash) && !isEditorRoute(target)) {
    history.replaceState(null, '', renderedHash);
    requestLeave(() => navigate(target));
  } else render();
});
document.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank') return;
  const href = link.getAttribute('href');
  const newLetter = href === '#/write' && !link.hasAttribute('data-continue');
  const leavingEditor = state.dirty && isEditorRoute(renderedHash) && !isEditorRoute(href);
  if (!newLetter && !leavingEditor) return;
  event.preventDefault();
  requestLeave(() => {
    if (newLetter) { state.editor = null; state.dirty = false; submission.clear(); }
    if (href.startsWith('#')) navigate(href); else location.assign(href);
  });
}, true);
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });

await service.session().catch(error => toast(errorText(error)));
updateAccount();
render();

const startupParams = new URLSearchParams(location.search);
if (startupParams.get('login') === '1') {
  history.replaceState(null, '', `${location.pathname}${location.hash || '#/mailbox'}`);
  if (!service.user) openAuth();
}
