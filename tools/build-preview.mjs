import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const names=['config.js','domain.js','api.js','demo.js','app.js'];
const modules=[];
for(const name of names){
  let source=await readFile(resolve(root,'frontend',name),'utf8');
  source=source.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')
    .replaceAll('href="../index.html"','href="https://jiayingtian.github.io/LuoJiaPostOffice/"');
  // 离线文件始终用于演示，避免后续切换真实模式后误打包真实请求。
  if(name==='config.js') source=source.replace(/mode:\s*['"]api['"]/, "mode: 'demo'");
  if(name==='app.js') source='const e=escapeHTML;\n'+source;
  modules.push(source);
}
let html=await readFile(resolve(root,'frontend/index.html'),'utf8');
const css=await readFile(resolve(root,'frontend/app.css'),'utf8');
html=html.replace('<link rel="stylesheet" href="app.css">',()=>`<style>${css}</style>`)
  .replace('<link rel="icon" href="../favicon.svg" type="image/svg+xml">','')
  .replaceAll('href="../index.html"','href="https://jiayingtian.github.io/LuoJiaPostOffice/"')
  .replace('<script type="module" src="app.js"></script>',()=>`<script type="module">\n${modules.join('\n').replaceAll('</script','<\\/script')}\n</script>`);
await mkdir(resolve(root,'dist'),{recursive:true});
await writeFile(resolve(root,'dist/luojia-preview.html'),html);
console.log('已生成 dist/luojia-preview.html，可直接双击打开（仅本机演示）。');
