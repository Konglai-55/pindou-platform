export const GRID_MAX = 250;
export const brands = ['MARD','COCO','ManMan','PanPan','MiXiaoWo','自定义'];
export const paletteSizes = [24,48,72,96,120,144,221,291];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));

export function distance(a,b) {
  const red=(a[0]+b[0])/2;
  return (2+red/256)*(a[0]-b[0])**2+4*(a[1]-b[1])**2+(2+(255-red)/256)*(a[2]-b[2])**2;
}

export function matchColor(color,palette) {
  let result=null, closest=Infinity;
  for(const entry of palette){
    const diff=distance(color,entry.rgb);
    if(diff<closest){ result=entry.code; closest=diff; }
  }
  return result;
}

export function paletteSubset(rows, size=291) {
  if(size>=rows.length) return rows.map(([code,hex])=>({code,hex}));
  const prepared=rows.map(([code,hex,group])=>({code,hex,group,rgb:rgb(hex),best:Infinity}));
  if(size===221&&rows.length===291&&prepared.some(c=>c.code==='ZG1')){
    const standard=prepared.filter(c=>/^[A-HM]$/.test(c.group));
    if(standard.length===221) return standard.map(({code,hex})=>({code,hex}));
  }
  const selected=new Set();
  let next=prepared.reduce((best,entry)=>distance(entry.rgb,[16,16,16])<distance(best.rgb,[16,16,16])?entry:best);
  for(let i=0;i<size;i++){
    selected.add(next.code);
    for(const entry of prepared) entry.best=Math.min(entry.best,distance(entry.rgb,next.rgb));
    const farthest=prepared.reduce((best,entry)=>!selected.has(entry.code)&&(!best||entry.best>best.best)?entry:best,null);
    next=farthest;
    if(!next) break;
  }
  return prepared.filter(c=>selected.has(c.code)).map(({code,hex})=>({code,hex}));
}

export function createPattern(w,h,palette,extra={}) {
  return {w,h,title:'未命名图纸',brand:'MARD',palette,cells:Array(w*h).fill(null),tone:'#e8e3fc',source:'blank',...extra};
}

export function tally(pattern) {
  const byCode=new Map();
  for(const code of pattern.cells) if(code) byCode.set(code,(byCode.get(code)||0)+1);
  return pattern.palette.filter(c=>byCode.has(c.code)).map(c=>({...c,count:byCode.get(c.code)})).sort((a,b)=>b.count-a.count||a.code.localeCompare(b.code,'en',{numeric:true}));
}

export function reduceColors(pattern, merge=0, limit=0) {
  const counts=tally(pattern);
  if(!counts.length) return pattern;
  const active=counts.map(color=>({...color,rgb:rgb(color.hex)}));
  const kept=[], remap=new Map();
  for(const color of active){
    const code=matchColor(color.rgb,kept);
    const nearest=kept.find(c=>c.code===code);
    if(nearest&&((merge>0&&distance(color.rgb,nearest.rgb)<(merge*1.35)**2)||(limit>0&&kept.length>=limit))) remap.set(color.code,code);
    else kept.push(color);
  }
  return {...pattern,cells:pattern.cells.map(code=>remap.get(code)||code)};
}

export function flood(cells,w,h,start,replace) {
  const from=cells[start];
  if(from===replace||start<0||start>=cells.length) return;
  const remaining=[start];
  cells[start]=replace;
  const visit=i=>{ if(cells[i]===from){ cells[i]=replace; remaining.push(i); } };
  while(remaining.length){
    const i=remaining.pop();
    if(i%w>0) visit(i-1);
    if(i%w<w-1) visit(i+1);
    if(i>=w) visit(i-w);
    if(i+w<w*h) visit(i+w);
  }
}

export function clearBorder(pattern) {
  const {w,h,cells,palette}=pattern;
  const dist=new Map(palette.map(c=>[c.code,rgb(c.hex)]));
  const edges=[];
  for(let x=0;x<w;x++) edges.push(x,(h-1)*w+x);
  for(let y=1;y<h-1;y++) edges.push(y*w,y*w+w-1);
  const sample=new Map();
  for(const i of edges) if(cells[i]) sample.set(cells[i],(sample.get(cells[i])||0)+1);
  const dominant=[...sample].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(!dominant||sample.get(dominant)<edges.length*.35) return 0;
  const target=dist.get(dominant), queue=[], visited=new Uint8Array(cells.length);
  const visit=i=>{
    if(visited[i]) return;
    visited[i]=1;
    if(cells[i]&&distance(target,dist.get(cells[i]))<47**2){ cells[i]=null; queue.push(i); }
  };
  for(const i of edges) visit(i);
  let cleared=0;
  while(queue.length){
    const i=queue.pop(); cleared++;
    if(i%w>0) visit(i-1);
    if(i%w<w-1) visit(i+1);
    if(i>=w) visit(i-w);
    if(i+w<w*h) visit(i+w);
  }
  return cleared;
}

export function imageToPattern(image,w,h,palette,settings={}) {
  const canvas=document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=settings.mode!=='pixel';
  ctx.imageSmoothingQuality='high';
  const rect=settings.crop||[0,0,image.width,image.height];
  ctx.drawImage(image,...rect,0,0,w,h);
  const {data}=ctx.getImageData(0,0,w,h);
  const prepared=palette.map(c=>({...c,rgb:rgb(c.hex)}));
  const work=settings.mode==='dither'?Float32Array.from(data):data;
  const entries=new Map(prepared.map(c=>[c.code,c.rgb]));
  const cells=Array(w*h).fill(null);
  const memo=new Map();
  for(let i=0;i<cells.length;i++){
    const pos=i*4;
    if(data[pos+3]<100) continue;
    const sample=[work[pos],work[pos+1],work[pos+2]].map(c=>clamp(Math.round(c),0,255));
    const key=(sample[0]<<16)|(sample[1]<<8)|sample[2];
    if(!memo.has(key)) memo.set(key,matchColor(sample,prepared));
    const code=memo.get(key);
    cells[i]=code;
    if(settings.mode!=='dither'||!code) continue;
    const error=sample.map((v,k)=>v-entries.get(code)[k]), x=i%w;
    const spill=(index,weight)=>{
      if(index>=cells.length||data[index*4+3]<100) return;
      for(let k=0;k<3;k++) work[index*4+k]+=error[k]*weight/16;
    };
    if(x<w-1) spill(i+1,7);
    if(x>0) spill(i+w-1,3);
    spill(i+w,5);
    if(x<w-1) spill(i+w+1,1);
  }
  return reduceColors(createPattern(w,h,palette,{...settings.extra,cells}),settings.merge,settings.limit);
}

export function resizePattern(pattern,w,h) {
  const old=pattern.cells;
  const cells=Array.from({length:w*h},(_,i)=>old[Math.min(pattern.h-1,Math.floor(Math.floor(i/w)*pattern.h/h))*pattern.w+Math.min(pattern.w-1,Math.floor((i%w)*pattern.w/w))]);
  return {...pattern,w,h,cells};
}

export function remapPalette(pattern,palette,brand) {
  const prepared=palette.map(c=>({...c,rgb:rgb(c.hex)}));
  const swap=new Map(pattern.palette.map(c=>[c.code,matchColor(rgb(c.hex),prepared)]));
  return {...pattern,brand,palette,cells:pattern.cells.map(c=>c?swap.get(c)||null:null)};
}

export function validateImported(input) {
  if(!input||!Number.isInteger(input.w)||!Number.isInteger(input.h)||input.w<1||input.h<1||input.w>GRID_MAX||input.h>GRID_MAX||!Array.isArray(input.cells)||input.cells.length!==input.w*input.h||!Array.isArray(input.palette)||input.palette.length>400) throw Error('文件不是有效的豆格图纸');
  const codes=new Set();
  for(const c of input.palette){
    if(!c||typeof c.code!=='string'||!/^[\w-]{1,16}$/.test(c.code)||typeof c.hex!=='string'||!/^#[\da-f]{6}$/i.test(c.hex)||codes.has(c.code)) throw Error('文件中的色板无效');
    codes.add(c.code);
  }
  if(input.cells.some(c=>c!==null&&!codes.has(c))) throw Error('图纸含有未定义的色号');
  return {
    w:input.w,h:input.h,palette:input.palette.map(({code,hex})=>({code,hex})),cells:input.cells,
    title:typeof input.title==='string'&&input.title.trim()?input.title.trim().slice(0,60):'导入的图纸',
    tone:typeof input.tone==='string'&&/^#[\da-f]{6}$/i.test(input.tone)?input.tone:'#e8e3fc',
    brand:brands.includes(input.brand)?input.brand:'自定义',
    source:['image','blank','text','qr'].includes(input.source)?input.source:'blank'
  };
}

export function chartCanvas(pattern, options={}) {
  const catalog=tally(pattern);
  const cell=options.cell||26, showCodes=options.codes!==false, showGrid=options.grid!==false;
  const legend=options.legend!==false, pad=options.clean?0:36, top=options.clean?0:100;
  const legendWidth=Math.max(340,pattern.w*cell);
  const columns=Math.max(2,Math.floor(legendWidth/135));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(pattern.w*cell,options.clean?1:340)+pad*2;
  canvas.height=top+pattern.h*cell+pad+(legend&&catalog.length?60+Math.ceil(catalog.length/columns)*29:0);
  const ctx=canvas.getContext('2d');
  if(!options.transparent){
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  }
  const colors=new Map(pattern.palette.map(c=>[c.code,c.hex]));
  const rows=pattern.w*pattern.h;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 '+Math.max(8,Math.round(cell*.34))+'px Arial';
  for(let i=0;i<rows;i++){
    const code=pattern.cells[i], x=pad+(i%pattern.w)*cell, y=top+Math.floor(i/pattern.w)*cell;
    if(code){
      const hex=colors.get(code);
      ctx.fillStyle=hex; ctx.fillRect(x,y,cell,cell);
      if(showCodes){
        const [r,g,b]=rgb(hex);
        ctx.fillStyle=(r*.299+g*.587+b*.114)>151?'#1d1a21':'#fff';
        ctx.fillText(code,x+cell/2,y+cell/2,cell-2);
      }
    }
  }
  if(showGrid){
    ctx.strokeStyle='#23203035'; ctx.lineWidth=1; ctx.beginPath();
    for(let x=0;x<=pattern.w;x++){ const p=pad+x*cell+.5; ctx.moveTo(p,top); ctx.lineTo(p,top+pattern.h*cell); }
    for(let y=0;y<=pattern.h;y++){ const p=top+y*cell+.5; ctx.moveTo(pad,p); ctx.lineTo(pad+pattern.w*cell,p); }
    ctx.stroke();
    if(!options.clean){
      ctx.strokeStyle='#23203094'; ctx.beginPath();
      for(let x=0;x<=pattern.w;x+=5){ const p=pad+x*cell+.5; ctx.moveTo(p,top); ctx.lineTo(p,top+pattern.h*cell); }
      for(let y=0;y<=pattern.h;y+=5){ const p=top+y*cell+.5; ctx.moveTo(pad,p); ctx.lineTo(pad+pattern.w*cell,p); }
      ctx.stroke();
      ctx.fillStyle='#524c67';ctx.font='11px Arial';
      for(let x=0;x<pattern.w;x++) if(x===0||(x+1)%5===0) ctx.fillText(x+1,pad+(x+.5)*cell,top-11);
      for(let y=0;y<pattern.h;y++) if(y===0||(y+1)%5===0) ctx.fillText(y+1,pad/2,top+(y+.5)*cell);
    }
  }
  if(!options.clean){
    ctx.fillStyle='#25213b';ctx.textAlign='left';ctx.font='bold 25px sans-serif';ctx.fillText(pattern.title,pad,33,canvas.width-pad*2);
    ctx.font='13px sans-serif';ctx.fillStyle='#68647e';
    ctx.fillText(pattern.w+' × '+pattern.h+' 格   '+pattern.brand+'   '+catalog.length+' 色   '+catalog.reduce((n,c)=>n+c.count,0)+' 颗',pad,59);
  }
  if(legend&&catalog.length){
    const y=top+pattern.h*cell+27;
    ctx.textAlign='left';ctx.fillStyle='#25213b';ctx.font='bold 16px sans-serif';ctx.fillText('用豆清单',pad,y);
    catalog.forEach((c,i)=>{
      const x=pad+(i%columns)*Math.floor(legendWidth/columns), yy=y+26+Math.floor(i/columns)*29;
      ctx.fillStyle=c.hex;ctx.fillRect(x,yy-8,16,16);ctx.strokeStyle='#26233533';ctx.strokeRect(x,yy-8,16,16);
      ctx.fillStyle='#25213b';ctx.font='13px sans-serif';ctx.fillText(c.code+' × '+c.count,x+23,yy);
    });
  }
  return canvas;
}