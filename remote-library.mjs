import { createHash } from 'node:crypto';

const categories=new Set(['人物','动漫','动物','美食','花卉','节日','文字','风景','其他']);
const cache={at:0,items:[],error:''};
let reportedError='';

const manifestUrl=()=>process.env.REMOTE_LIBRARY_MANIFEST_URL?.trim();

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
  const preview=entry.chart?.previewSrc;
  const chart=entry.chart?.src||preview;
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

export function remoteLibraryConfigured(){
  return Boolean(manifestUrl());
}

export async function getRemoteLibrary({force=false}={}){
  if(!remoteLibraryConfigured())return [];
  if(!force&&cache.at&&Date.now()-cache.at<5*60*1000)return cache.items;
  try {
    const response=await fetch(manifestUrl(),{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('远程图纸目录返回 HTTP '+response.status);
    const manifest=await response.json();
    const items=Array.isArray(manifest.data)?manifest.data.map(itemFor).filter(Boolean):[];
    cache.at=Date.now();cache.items=items;cache.error='';
    return items;
  } catch(error) {
    cache.at=Date.now();cache.items=[];cache.error=error.message;
    if(reportedError!==error.message){reportedError=error.message;console.warn('远程图纸库暂时不可用:',error.message);}
    return [];
  }
}
