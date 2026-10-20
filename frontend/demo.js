import { ApiError } from './api.js';
import { excerpt } from './domain.js';

export const demoPattern = { id: 'pat_demo_rice', name: '米色信纸', previewUrl: '../pictures/material/letter-paper/rice-yellow.png' };
const samples = [
  ['想把那天的晚霞寄给你', '上周傍晚，从图书馆出来的时候，天边忽然变成了很浅的橘色。\n\n大家都在赶路，我却想起你以前总说，要给一天留一点发呆的时间。于是我在台阶上坐了一会儿，看云慢慢走远。\n\n这封信没有什么大事，只想告诉你，我今天也有好好生活。', '晚归的人'],
  ['食堂最后一份热汤', '那天实验结束得很晚，我到食堂时，好几个窗口已经收拾好了。阿姨看见我，问了一句：“还没吃饭呀？”\n\n她从锅里盛出最后一份热汤，放到我手里。热气让眼镜起了一层雾。那一刻，忙乱的一天好像终于有了一个温柔的句号。', '一位珞珈来客'],
  ['致一起走过雨天的朋友', '还记得我们共撑一把伞走回宿舍吗？明明两个人都淋湿了，却一路笑个不停。\n\n后来每次经过那条路，我都会想起那个很普通的下午。谢谢你，让一些并不顺利的日子，也有了值得记住的部分。', '小满'],
  ['路灯亮起的时候', '我喜欢傍晚的校园。白天没有说出口的话，会在路灯亮起时慢慢变得清楚。\n\n有人抱着书，有人拎着晚饭，有人停下来给家里打电话。我们擦肩而过，却也分享着同一个温暖的夜晚。', '山下'],
  ['今天也向前走了一点', '这周过得有点慢。好几次想把做不出来的题丢在一边，又还是打开了笔记。\n\n今天终于弄懂了一个很小的问题。虽然只前进了一点点，我还是决定给自己买一杯热豆浆，作为小小的奖励。', '慢慢来'],
  ['留一盏灯等你', '宿舍的灯还亮着，桌上留着你喜欢的小面包。\n\n我们说好，等这一阵忙完，就一起去操场走走。不用聊成绩，也不用想计划，只是随便说说今天遇到了什么人、听见了什么笑话。等你回来。', '室友'],
  ['在书页里遇见秋天', '翻开借来的书，里面夹着一张很旧的书签。背面写着一句话：记得看看窗外。\n\n于是我抬起头，发现树叶已经有些黄了。原来在我埋头赶路的时候，秋天也一直安静地陪着我。', '书页之间'],
];
const seeds = samples.map(([title, content, name], i) => ({
  id: `let_demo_${i + 1}`, title, content, excerpt: excerpt(content),
  author: { displayName: name, isAnonymous: false }, recipient: { type: 'wall', user: null },
  location: null, pattern: demoPattern, status: 'active', visibility: 'public',
  submittedAt: '2026-10-17T09:00:00Z', publishedAt: `2026-10-${17-i}T10:00:00Z`,
  createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-17T09:00:00Z',
  allowReplies: true, parentLetterId: null, resonanceCount: 0, favoriteCount: 0, responseCount: 0, replyCount: 0,
  isResonated: false, isFavorited: false, canEdit: false, canDelete: false, canForward: false,
}));
const storageKey = 'luojia.demo.letters.v1';

export class DemoService {
  constructor(storage = localStorage, sessionStorageRef = sessionStorage) {
    this.storage = storage; this.sessionStorage = sessionStorageRef; this.keys = new Map();
    this.user = null; this.csrfToken = null;
  }
  rows() {
    let rows;
    try { rows = JSON.parse(this.storage.getItem(storageKey) || '[]'); }
    catch { throw new ApiError('本机演示数据无法读取，请保留数据并联系开发者。'); }
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.content !== 'string')) {
      throw new ApiError('本机演示数据格式不正确，未覆盖原有内容。');
    }
    return rows;
  }
  async session() {
    if (this.sessionStorage.getItem('luojia.demo.signedIn') === 'true') await this.login();
    return this.user;
  }
  async login() {
    this.sessionStorage.setItem('luojia.demo.signedIn', 'true');
    this.user = { id: 'usr_demo', displayName: '演示来客', role: 'user' }; this.csrfToken = 'demo-only'; return this.user;
  }
  async logout() { this.sessionStorage.removeItem('luojia.demo.signedIn'); this.user = null; this.csrfToken = null; }
  async metadata() { return { locations: [], patterns: [demoPattern] }; }
  async list({ mine = false, drafts = false, workflowState, page = 1, pageSize = 6 } = {}) {
    if (mine && !this.user) throw new ApiError('请先使用演示身份。', { status: 401 });
    let rows = mine ? this.rows() : seeds;
    if (workflowState || drafts) rows = rows.filter(row => (row.workflowState || (row.status === 'draft' ? 'draft' : 'pendingReview')) === (workflowState || 'draft'));
    if (mine) rows = [...rows].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length, hasMore: page * pageSize < rows.length };
  }
  async detail(id) {
    const row = seeds.find(row => row.id === id) || (this.user && this.rows().find(row => row.id === id));
    if (!row) throw new ApiError('这封信暂时无法查看。', { status: 404 });
    return structuredClone(row);
  }
  async replies(id, { page = 1, pageSize = 6 } = {}) {
    await this.detail(id);
    return { items: [], page, pageSize, total: 0, hasMore: false };
  }
  async save(payload, { id, key } = {}) {
    if (!this.user) throw new ApiError('请先使用演示身份。', { status: 401 });
    if (!id && this.keys.has(key)) return this.detail(this.keys.get(key));
    const rows = this.rows();
    const previous = id ? rows.find(row => row.id === id) : null;
    if (id && (!previous || previous.status !== 'draft')) throw new ApiError('只能继续编辑自己的草稿。', { status: 409 });
    const draft = id ? !payload.submitForReview : payload.saveAsDraft;
    const now = new Date().toISOString();
    const row = {
      ...seeds[0], id: id || `let_local_${crypto.randomUUID()}`, ...payload,
      author: { displayName: payload.isAnonymous ? '匿名来客' : payload.penName || '演示来客', isAnonymous: payload.isAnonymous },
      recipient: { type: 'wall', user: null }, pattern: demoPattern,
      excerpt: excerpt(payload.content), parentLetterId: previous?.parentLetterId || payload.parentLetterId || null,
      workflowState: draft ? 'draft' : 'pendingReview', status: draft ? 'draft' : 'active', visibility: 'public', publishedAt: null,
      submittedAt: draft ? null : now, createdAt: previous?.createdAt || now, updatedAt: now,
      canEdit: draft, canDelete: true, canForward: false,
    };
    // 演示存储与真实接口完全隔离，不保存账号口令或 token。
    const next = [row, ...rows.filter(item => item.id !== row.id)];
    try { this.storage.setItem(storageKey, JSON.stringify(next)); }
    catch { throw new ApiError('浏览器未能保存，请检查存储空间。内容仍在编辑器中。'); }
    if (!id) this.keys.set(key, row.id);
    return structuredClone(row);
  }
}
