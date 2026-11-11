import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist/contest');
const staging = resolve(output, 'staging');
const team = (process.env.TEAM_NAME || '待填写队伍名').trim();
const captain = (process.env.CAPTAIN_NAME || '待填写队长姓名').trim();
const members = (process.env.TEAM_MEMBERS || '【待填写：成员姓名和赛事要求的个人信息】').trim();
const sources = (process.env.ASSET_SOURCES || '【待核实：逐项列出素材来源、自制部分与授权】').trim();
const safeName = value => value.replace(/[\\/:*?"<>|\r\n]/g, '_');
const stem = safeName(`零杯壹组-${team}-${captain}`);
const fullName = `2026-${stem}-完整版.zip`;
const anonymousName = `2026-${stem}-匿名版本.zip`;
const pending = [team, captain, members, sources].some(x => /待填写|待核实/.test(x));

await rm(output, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

const files = ['index.html', 'styles.css', 'script.js', 'favicon.svg', 'package.json',
  'backend', 'tests', 'tools',
  'pictures/material/letter-paper/rice-yellow.png'];
const frontFiles = ['index.html', 'about.html', 'auth.html', 'app.css', 'app.js',
  'auth.css', 'auth.js', 'calendar-v21.css', 'calendar.js', 'config.js',
  'demo.js', 'api.js', 'domain.js', 'runtime-config.js', 'assets', 'README.md'];
const safeSource = source => !source.split(/[\\/]/).some(part =>
  part === '__pycache__' || part === '.env' || part.endsWith('.pyc'));

const plain = source => source.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const calendar = plain(await readFile(resolve(root, 'frontend/calendar.js'), 'utf8'));
const api = plain(await readFile(resolve(root, 'frontend/api.js'), 'utf8'));
const domain = plain(await readFile(resolve(root, 'frontend/domain.js'), 'utf8'));
const demo = plain(await readFile(resolve(root, 'frontend/demo.js'), 'utf8'));
const auth = plain(await readFile(resolve(root, 'frontend/auth.js'), 'utf8'));

for (const edition of ['full', 'anonymous']) {
  const target = resolve(staging, edition, '珞珈烟火邮局');
  await mkdir(target, { recursive: true });
  for (const file of files) {
    const destination = resolve(target, file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(root, file), destination, { recursive: true, filter: safeSource });
  }
  for (const file of frontFiles) {
    const destination = resolve(target, 'frontend', file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(root, 'frontend', file), destination, { recursive: true, filter: safeSource });
  }
  // The judging copy also works when its fully extracted index.html is opened
  // directly from disk. Chrome blocks local ES-module imports on file://.
  const mailbox = resolve(target, 'frontend/index.html');
  const mailboxHtml = await readFile(mailbox, 'utf8');
  await writeFile(mailbox, mailboxHtml.replace(
    '<script type="module">\nimport { calendarParts, groupEntriesByDate, sentLetterEntries } from \'./calendar.js\';',
    `<script>\n${calendar}`,
  ));
  const about = resolve(target, 'frontend/about.html');
  const aboutHtml = await readFile(about, 'utf8');
  await writeFile(about, aboutHtml.replace(
    '<script type="module">\n    import { ApiClient } from \'./api.js\';\n    import { DemoService } from \'./demo.js\';',
    `<script>\n${domain}\n${api}\n${demo}`,
  ));
  const authPage = resolve(target, 'frontend/auth.html');
  const authHtml = await readFile(authPage, 'utf8');
  await writeFile(authPage, authHtml.replace('<script type="module" src="auth.js"></script>', '<script src="auth-offline.js"></script>'));
  await writeFile(resolve(target, 'frontend/auth-offline.js'), `${api}\n${auth}`);
  // Keep historical notes and account identifiers out of the judging copies.
  const introduction = `# 珞珈烟火邮局\n\n一座可读、可写、可偶遇陌生人故事的线上邮局。静态演示包括公共来信、时光日历、信纸邮票、投递盖戳动画、草稿、我的信件与回信。\n\n## 打开网页\n\n先完整解压本 ZIP（不要在压缩包预览窗口里单独打开 index.html），再打开解压得到的「珞珈烟火邮局」文件夹中的 index.html。登录及其他页面依赖同一文件夹里的 frontend/ 与 pictures/。也可以安装 Node.js 20+ 后在该文件夹运行 npm run dev，再打开终端显示的网址；无需数据库。运行 npm test 可执行逻辑测试。\n\n## 技术与流程\n\n前端为原生 HTML、CSS、JavaScript，没有预设样式库或外部 CDN。后端采用 FastAPI（接口）、Uvicorn（服务）、SQLAlchemy（数据库映射）、Alembic（迁移）、PyMySQL（驱动）、pydantic-settings（配置）、argon2-cffi（密码哈希），详见 backend/README.md。静态演示中的新增数据在当前浏览器保存；真实接口模式需另启 MySQL 和后端。两个模式均为寄出后即时公开，无管理员审核。\n\n建议展示规格：1920、1440、720；赛事环境 Chrome 129。\n`;
  const personal = edition === 'full'
    ? `\n## 参赛信息（完整版）\n\n队伍：${team}\n\n队长：${captain}\n\n成员及个人信息：${members}\n\n## 素材来源与授权\n\n${sources}\n`
    : '\n## 匿名说明\n\n本版用于匿名评选，不含选手个人信息。素材来源与授权仍由队伍在完整版中据实提供。\n';
  await writeFile(resolve(target, 'README.MD'), introduction + personal);
  await run('zip', ['-q', '-r', resolve(output, edition === 'full' ? fullName : anonymousName), '珞珈烟火邮局'], { cwd: resolve(staging, edition) });
}
await run('zip', ['-q', resolve(output, `${stem}.zip`), fullName, anonymousName], { cwd: output });
await rm(staging, { recursive: true });
console.log(`已生成 ${resolve(output, `${stem}.zip`)}`);
if (pending) console.warn('队伍、成员或素材信息尚未补全：此包供检查，不可直接作为正式邮件附件。');
