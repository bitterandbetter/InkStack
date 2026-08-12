import fs from 'node:fs';
import path from 'node:path';

const base = path.join(process.cwd(), 'Typora主题');
const EXCLUDE_DIRS = new Set(['.DS_Store','bloom','claude_fonts','latex_fonts','fonts','img','docs','plugin','plugin-live','samples','source','submission','template','preview','showcase','screenshots','morandigarden','nocturne','pink-hsiao','blue-topaz','vlook']);
const EXCLUDE_FILES = new Set(['font.css','latex-dev-dark.css','fs-dyn-min.css','fs-ink-min.css','fs-sans-min.css','fs-serif-min.css','fs-yuan-min.css','fs-zen-min.css']);

function walk(dir){const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const full=path.join(dir,e.name);if(e.isDirectory()){if(EXCLUDE_DIRS.has(e.name))continue;out.push(...walk(full));}else if(e.isFile()&&e.name.endsWith('.css')&&!EXCLUDE_FILES.has(e.name)){out.push(full);}}return out;}

const files = walk(base).filter((f)=>!(f.includes(path.sep+'released'+path.sep)&&f.includes('VLOOK'))&&!(f.includes(path.sep+'docs'+path.sep)&&f.includes('VLOOK')));
const tokenCount = new Map();
for(const f of files){
  const content = fs.readFileSync(f,'utf8');
  for(const m of content.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)){
    const name = m[1];
    tokenCount.set(name,(tokenCount.get(name)||0)+1);
  }
}
const sorted = [...tokenCount.entries()].sort((a,b)=>b[1]-a[1]);
for(const [name,count] of sorted){
  console.log(`${String(count).padStart(4)}  --${name}`);
}
