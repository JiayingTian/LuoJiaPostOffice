import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'dist/luojia-preview');

await rm(target, { recursive: true, force: true });
await mkdir(resolve(target, 'tools'), { recursive: true });
for (const name of ['index.html', 'styles.css', 'script.js', 'favicon.svg', 'package.json']) {
  await cp(resolve(root, name), resolve(target, name));
}
await cp(resolve(root, 'frontend'), resolve(target, 'frontend'), { recursive: true });
await mkdir(resolve(target, 'pictures/material/letter-paper'), { recursive: true });
await cp(
  resolve(root, 'pictures/material/letter-paper/rice-yellow.png'),
  resolve(target, 'pictures/material/letter-paper/rice-yellow.png'),
);
await cp(resolve(root, 'tools/dev-server.mjs'), resolve(target, 'tools/dev-server.mjs'));
await writeFile(resolve(target, 'README.md'),
  '# 珞珈烟火邮局 · 演示包\n\n需要 Node.js 20 或更新版本。进入本目录运行 `npm run dev`，然后打开终端显示的网址。无需安装依赖或启动数据库。\n');
console.log(`已生成 ${target}。进入该目录运行 npm run dev 后查看演示。`);
