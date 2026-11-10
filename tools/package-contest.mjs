import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
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
  'backend', 'tests', 'tools', 'docs/参赛提交说明.md',
  'pictures/material/letter-paper/rice-yellow.png'];
const frontFiles = ['index.html', 'about.html', 'auth.html', 'app.css', 'app.js',
  'auth.css', 'auth.js', 'calendar-v21.css', 'calendar.js', 'config.js',
  'demo.js', 'api.js', 'domain.js', 'runtime-config.js', 'assets', 'README.md'];

for (const edition of ['full', 'anonymous']) {
  const target = resolve(staging, edition, '珞珈烟火邮局');
  await mkdir(target, { recursive: true });
  for (const file of files) {
    const destination = resolve(target, file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(root, file), destination, { recursive: true });
  }
  for (const file of frontFiles) {
    const destination = resolve(target, 'frontend', file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(root, 'frontend', file), destination, { recursive: true });
  }
  // Keep historical notes and account identifiers out of the judging copies.
  const introduction = `# 珞珈烟火邮局\n\n一座可读、可写、可偶遇陌生人故事的线上邮局。静态演示包括公共来信、时光日历、信纸邮票、投递盖戳动画、草稿、我的信件与回信。\n\n## 运行\n\nNode.js 20+；在本目录运行 npm run dev 并打开显示的网址。无需安装依赖或数据库。运行 npm test 执行逻辑测试；后端独立说明见 backend/README.md。\n\n## 技术及限制\n\n前端为原生 HTML/CSS/JavaScript，没有预设样式库或外部 CDN。后端采用 FastAPI、Uvicorn、SQLAlchemy、Alembic、PyMySQL、pydantic-settings、argon2-cffi；各自用途和运行模式见 docs/参赛提交说明.md。静态演示中的新增数据保存在同一浏览器，真实接口模式仍保留管理员审核，与演示即时公开规则不同。\n\n建议展示规格：1920、1440、720；赛事环境 Chrome 129。\n`;
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
