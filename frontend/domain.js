export const charCount = (text = '') => Array.from(text).length;
export const excerpt = (text = '') => Array.from(text.replace(/\s+/gu, ' ').trim()).slice(0, 120).join('');
export const escapeHTML = (text = '') => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function validateLetter(letter, { draft = false } = {}) {
  const errors = {};
  const title = charCount(draft ? letter.title : letter.title.trim());
  const content = charCount(draft ? letter.content : letter.content.trim());
  if (!draft && (title < 2 || title > 80)) errors.title = '标题请写 2–80 个字符。';
  if (!draft && (content < 20 || content > 1500)) errors.content = '正文请写 20–1500 个字符。';
  if (draft && title > 80) errors.title = '标题最多 80 个字符。';
  if (draft && content > 1500) errors.content = '正文最多 1500 个字符。';
  if (charCount(letter.penName || '') > 30) errors.penName = '署名最多 30 个字符。';
  if (!letter.patternId) errors.patternId = '信纸尚未准备好，请稍后重试。';
  return errors;
}

export function letterPayload(letter, { draft = false, update = false } = {}) {
  const common = {
    title: draft ? letter.title : letter.title.trim(), content: draft ? letter.content : letter.content.trim(),
    recipientType: 'wall', recipientUserId: null,
    penName: letter.penName?.trim() || null, isAnonymous: Boolean(letter.isAnonymous),
    locationId: null, patternId: letter.patternId,
    allowResponses: letter.allowResponses ?? false, allowReplies: letter.allowReplies ?? true,
  };
  return update
    ? { ...common, submitForReview: !draft }
    : { ...common, parentLetterId: letter.parentLetterId || null, saveAsDraft: draft };
}

export function statusLabel(letter) {
  if (letter.workflowState) return ({ draft:'草稿', pendingReview:'待审核', published:'已公开', returnedForEdit:'退回修改' })[letter.workflowState] || '状态待确认';
  if (letter.status === 'deleted') return '已删除';
  if (letter.status === 'draft') return letter.reviewNote ? '退回修改' : '草稿';
  if (letter.status === 'active' && letter.visibility === 'public') {
    if (letter.publishedAt) return '已公开';
    if (letter.submittedAt) return '待审核';
  }
  if (letter.status === 'active' && letter.visibility === 'private') return '私人信件';
  return '状态待确认';
}

// 同一次创建超时后复用 Key；更改内容后再创建才换 Key。
export function createSubmissionKey(getUUID = () => crypto.randomUUID()) {
  let signature, key;
  return {
    for(payload) {
      const next = JSON.stringify(payload);
      if (signature !== next) { signature = next; key = getUUID(); }
      return key;
    },
    clear() { signature = key = undefined; },
  };
}
