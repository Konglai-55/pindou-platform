import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';

const categories=new Set(['人物','动漫','动物','美食','花卉','节日','文字','风景','其他']);
export const remoteImageOrigin='https://pindou.cn-nb1.rains3.com';
export function remoteImageUrl(value){
  try {
    const url=new URL(value);
    if(url.origin===remoteImageOrigin&&!url.username&&!url.password&&url.pathname.startsWith('/pixel-cafe/'))return url.href;
  } catch {}
}

function titleFromKey(key){
  const name=key.split('/').filter(Boolean).pop()||key;
  return name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').trim().slice(0,60)||'远程图纸';
}
function categoryFromKey(key){
  const segment=key.split('/').filter(Boolean).find(part=>categories.has(part));
  return segment||'其他';
}
function categoryFromManifest(value,name){
  const map={animals:'动物',anime:'动漫',food:'美食',nature:'风景',movie:'其他',game:'其他',decor:'其他'};
  if(map[value])return map[value];
  return categoryFromKey(name||'');
}
function itemFor(entry){
  const key=entry.storage?.previewKey||entry.chart?.previewSrc||entry.id||'';
  const preview=remoteImageUrl(entry.chart?.previewSrc);
  const chart=remoteImageUrl(entry.chart?.src)||preview;
  if(!key||!preview)return null;
  const id='remote-'+createHash('sha1').update(key).digest('hex').slice(0,20);
  const palette=entry.palette&&typeof entry.palette==='object'?Object.keys(entry.palette).length:0;
  return {
    id,source:'remote',title:entry.name?.zh||entry.name?.en||titleFromKey(key),category:categoryFromManifest(entry.category,key),author:'远程图纸库',
    w:0,h:0,colors:palette,beads:0,palette,price:0,public:true,featured:false,views:0,saves:0,likes:entry.likes||0,reacts:[],
    description:entry.note?.zh||'来自远程拼豆图纸库的素材。打开图片查看原图。',updated:entry.order||Date.now(),
    preview,url:chart,key
  };
}

function readItems(manifest){
  if(!Array.isArray(manifest?.data))throw Error('远程图纸目录格式无效');
  return manifest.data.map(itemFor).filter(Boolean);
}

export function createRemoteLibrary(cacheFile){
  const source=process.env.REMOTE_LIBRARY_MANIFEST_URL?.trim();
  let items, pending, nextRefresh=0, reportedError='';
  const saved=source&&cacheFile?readFile(cacheFile,'utf8').then(text=>{
    const snapshot=JSON.parse(text);
    if(snapshot.source===source)items=readItems(snapshot.manifest);
  }).catch(error=>{
    if(error.code!=='ENOENT')console.warn('无法读取图纸目录缓存:',error.message);
  }):undefined;

  async function refresh(){
    try {
      const response=await fetch(source,{headers:{accept:'application/json'},signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw Error('远程图纸目录返回 HTTP '+response.status);
      const manifest=await response.json();
      items=readItems(manifest);
      reportedError='';
      nextRefresh=Date.now()+5*60*1000;
      if(cacheFile){
        const temporary=cacheFile+'.'+process.pid+'.tmp';
        await writeFile(temporary,JSON.stringify({source,manifest}));
        await rename(temporary,cacheFile);
      }
    } catch(error) {
      nextRefresh=Date.now()+30000;
      if(reportedError!==error.message){reportedError=error.message;console.warn('远程图纸目录刷新失败:',error.message);}
    }
  }

  return async function getRemoteLibrary(){
    if(!source)return [];
    await saved;
    if(!pending&&Date.now()>=nextRefresh)pending=refresh().finally(()=>{pending=undefined;});
    if(!items)await pending;
    return items||[];
  };
}
