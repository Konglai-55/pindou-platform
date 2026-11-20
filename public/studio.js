import QR from '/vendor/qr.mjs';
import { icon,$,esc,button,toast,modal,closeModal,api,formAction,textOf,brandOptions,number,downloadBlob } from './ui.js';
import { brands,paletteSizes,paletteSubset,GRID_MAX,createPattern,clamp,tally,flood,clearBorder,resizePattern,remapPalette,reduceColors,imageToPattern,chartCanvas } from './engine.js';

export async function loadImage(file){
  if(!file||!file.type.startsWith('image/')) throw Error('请选择图片文件');
  if(file.size>25*1024*1024) throw Error('请选择 25 MB 以内的图片');
  let source;
  try { source=await createImageBitmap(file); }
  catch { throw Error('无法读取图片，请尝试 PNG、JPG 或 WebP'); }
  const scale=Math.min(1,1500/Math.max(source.width,source.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(source.width*scale));
  canvas.height=Math.max(1,Math.round(source.height*scale));
  canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
  source.close();
  return canvas;
}

export function textPattern(text,w,h,palette){
  const canvas=document.createElement('canvas');
  canvas.width=w*6;canvas.height=h*6;
  const ctx=canvas.getContext('2d');
  const lines=text.split('\n').slice(0,8);
  let size=Math.floor(canvas.height/(lines.length*1.33));
  ctx.font='900 '+size+'px "Microsoft YaHei", "PingFang SC", sans-serif';
  const widest=Math.max(...lines.map(line=>ctx.measureText(line).width));
  size=Math.floor(size*Math.min(1,canvas.width*.9/widest));
  ctx.font='900 '+size+'px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#272036';
  lines.forEach((line,i)=>ctx.fillText(line,canvas.width/2,canvas.height/2+(i-(lines.length-1)/2)*size*1.15));
  return imageToPattern(canvas,w,h,palette,{extra:{title:'文字 · '+text.replace(/\s+/g,' ').slice(0,36),source:'text'}});
}

export function qrPattern(value,level='M'){
  QR.stringToBytes = input=>Array.from(new TextEncoder().encode(input));
  const qr=QR(0,level);
  try { qr.addData(value,'Byte'); qr.make(); } catch { throw Error('二维码内容过长，请缩短后重试'); }
  const length=qr.getModuleCount(), w=length+8;
  const palette=[{code:'BLACK',hex:'#171620'},{code:'WHITE',hex:'#ffffff'}];
  const cells=Array.from({length:w*w},(_,i)=>{
    const y=Math.floor(i/w)-4,x=i%w-4;
    return x>=0&&y>=0&&x<length&&y<length&&qr.isDark(y,x)?'BLACK':'WHITE';
  });
  return createPattern(w,w,palette,{title:'二维码拼豆图纸',brand:'自定义',source:'qr',cells,tone:'#e1edf2'});
}

export function readQR(canvas){
  const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
  const qr=globalThis.jsQR?.(data,canvas.width,canvas.height);
  if(!qr?.data) throw Error('未识别到二维码，请上传一张清晰的正面图片');
  return qr.data;
}

function triggerPNG(canvas,name){
  canvas.toBlob(blob=>blob?downloadBlob(blob,name+'.png'):toast('图片生成失败','error'),'image/png');
}
function printChart(canvas,title){
  const paper=document.createElement('img');
  paper.id='print-pattern';
  paper.alt=title;
  paper.src=canvas.toDataURL('image/png');
  paper.onload=()=>{
    $('#print-pattern')?.remove();
    document.body.append(paper);
    window.print();
    paper.remove();
  };
}

export async function makeVideo(pattern){
  if(!globalThis.MediaRecorder||!HTMLCanvasElement.prototype.captureStream) throw Error('当前浏览器不支持视频生成');
  const canvas=document.createElement('canvas');
  canvas.width=960;canvas.height=720;
  const ctx=canvas.getContext('2d'), cell=Math.min(44,Math.floor(Math.min(782/pattern.w,540/pattern.h)));
  const left=(960-pattern.w*cell)/2, top=105+(540-pattern.h*cell)/2;
  const colors=new Map(pattern.palette.map(c=>[c.code,c.hex]));
  const stream=canvas.captureStream(24);
  const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
  const recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);
  const chunks=[];
  const complete=new Promise((resolve,reject)=>{
    recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data);};
    recorder.onerror=()=>reject(Error('视频生成失败'));
    recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType}));
  });
  const filled=pattern.cells.map((c,i)=>c?[c,i]:null).filter(Boolean);
  const begin=performance.now();
  recorder.start();
  await new Promise(resolve=>{
    function frame(time){
      const progress=clamp((time-begin-400)/4000,0,1);
      ctx.fillStyle='#eeebfc';ctx.fillRect(0,0,960,720);
      ctx.textAlign='center';ctx.fillStyle='#27223e';ctx.font='bold 34px sans-serif';ctx.fillText(pattern.title,480,61,850);
      ctx.fillStyle='#fff';ctx.fillRect(left-10,top-10,pattern.w*cell+20,pattern.h*cell+20);
      for(let j=0;j<Math.floor(filled.length*progress);j++){
        const [code,i]=filled[j];
        ctx.fillStyle=colors.get(code);ctx.fillRect(left+(i%pattern.w)*cell,top+Math.floor(i/pattern.w)*cell,Math.max(1,cell-1),Math.max(1,cell-1));
      }
      ctx.fillStyle='#534e68';ctx.font='20px sans-serif';ctx.fillText(pattern.w+' × '+pattern.h+' 格   '+filled.length+' 颗拼豆',480,687);
      if(time-begin<5300) requestAnimationFrame(frame); else resolve();
    }
    requestAnimationFrame(frame);
  });
  if(recorder.state!=='inactive') recorder.stop();
  try { return await complete; } finally { stream.getTracks().forEach(track=>track.stop()); }
}

export function exportDialog(pattern) {
  const dlg=modal('导出图纸','<p class="muted dialog-copy">选择打印底稿、像素图或可继续编辑的图纸文件。</p><form id="export-form" class="form-stack"><label>导出格式<select name="format"><option value="chart">PNG 高清图纸</option><option value="pixel">PNG 像素效果</option><option value="print">打印 / PDF</option><option value="csv">CSV 用豆清单</option><option value="json">JSON 图纸文件</option><option value="video">动画视频</option></select></label><fieldset id="export-options"><legend>图纸内容</legend><label class="check-label"><input type="checkbox" name="codes" checked>格内色号</label><label class="check-label"><input type="checkbox" name="grid" checked>网格与坐标</label><label class="check-label"><input type="checkbox" name="legend" checked>用豆清单</label></fieldset><button type="submit" class="btn primary wide-btn">'+icon('download',17)+' 导出</button></form>');
  const form=$('#export-form',dlg), format=form.elements.format;
  format.onchange=()=>{$('#export-options',form).hidden=!['chart','print'].includes(format.value);};
  formAction(form,async()=>{
    const choice=format.value, name=pattern.title;
    if(choice==='csv'){
      const rows=['品牌,色号,颜色,数量',...tally(pattern).map(c=>[pattern.brand,c.code,c.hex,c.count].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(','))];
      downloadBlob(new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),name+'-用豆清单.csv');
    } else if(choice==='json'){
      downloadBlob(new Blob([JSON.stringify(pattern)],{type:'application/json'}),name+'.bead.json');
    } else if(choice==='video'){
      toast('正在生成动画，请保持页面开启');
      const result=await makeVideo(pattern);
      downloadBlob(result,name+(result.type.includes('mp4')?'.mp4':'.webm'));
    } else {
      const opts=choice==='pixel'?{cell:12,clean:true,transparent:true,codes:false,grid:false,legend:false}:{codes:form.elements.codes.checked,grid:form.elements.grid.checked,legend:form.elements.legend.checked};
      const canvas=chartCanvas(pattern,opts);
      if(choice==='print') printChart(canvas,name); else triggerPNG(canvas,name);
    }
    closeModal();
  });
}

const tools=[['brush','画笔','B'],['erase','橡皮','E'],['fill','填充','F'],['pick','吸管','I'],['target','色号坐标','C']];
const iconTool=(key,label,attrs='')=>button('',key,'data-tool="'+key+'" title="'+label+'" aria-label="'+label+'" '+attrs,'icon-button');
const colorItem=(c,active=false)=>'<button type="button" class="swatch '+(active?'selected':'')+'" data-code="'+esc(c.code)+'" aria-pressed="'+active+'" title="'+esc(c.code)+' '+esc(c.hex)+'"><i style="--chip:'+esc(c.hex)+'"></i><span>'+esc(c.code)+'</span></button>';

export function mountStudio(container, state, context) {
  let pattern=state.pattern;
  let tool='brush', zoom=100, showGrid=true, showCodes=false, picked=state.pattern.cells.find(Boolean)||pattern.palette[0]?.code;
  let undo=[],redo=[],active=false,last=-1,focus=-1,anchor=null,invalidated=false,disposed=false,pending=0,timer,epoch=0;
  let layerColors, strokeChanged=false, pointerId=null;
  const source=state.image;
  let settings={mode:'smooth',merge:0,limit:0,size:291,...state.settings};
  let lastLimit=settings.limit||16;
  const toolbar=tools.map(([key,label,shortcut])=>iconTool(key,label+' ['+shortcut+']')).join('');
  container.innerHTML='<div class="studio-shell"><div class="studio-top"><div class="studio-name"><a href="/projects" class="icon-button" title="返回我的作品" aria-label="返回我的作品">'+icon('back')+'</a><input id="pattern-title" maxlength="60" aria-label="图纸名称" value="'+esc(pattern.title)+'"><span id="save-state" class="muted"></span></div><div class="studio-actions">'+button('存到云端','cloud','id="cloud-save"','btn light')+button('发布','plus','id="publish"','btn')+button('导出图纸','download','id="export"','btn primary')+'</div></div><div class="studio-layout"><aside class="studio-panel controls"><h2>参数设置</h2><form id="dimensions" class="form-stack"><label>图纸尺寸</label><div class="size-inputs"><input type="number" name="w" min="1" max="250" required aria-label="宽度"><span>×</span><input type="number" name="h" min="1" max="250" required aria-label="高度"><button type="submit" class="btn small">应用</button></div></form><div class="panel-section"><label for="palette-brand">拼豆品牌</label><select id="palette-brand">'+brandOptions(brands,pattern.brand)+'</select><label for="palette-size">色板规格</label><select id="palette-size">'+paletteSizes.map(n=>'<option value="'+n+'">'+n+' 色</option>').join('')+'</select></div><form id="process" class="form-stack panel-section"><label>处理模式<select name="mode"><option value="smooth">均衡取样</option><option value="pixel">像素保真</option><option value="dither">抖动混色</option></select></label><label>颜色合并 <output id="merge-value"></output><input name="merge" type="range" min="0" max="100"></label><label>颜色上限 <small>0 为不限</small><input name="limit" type="number" min="0" max="100"></label><button class="btn small" type="submit">应用处理</button></form><div class="panel-section tool-list">'+button('一键去背景','spark','id="background"')+button('替换颜色','swap','id="replace-color"')+button('旋转画板','rotate','id="rotate"')+(source?button('裁剪原图','expand','id="crop"'):'')+'</div></aside><section class="surface"><div class="surface-tools"><div class="toolbar" aria-label="编辑工具">'+toolbar+'</div><div class="toolbar history-tools">'+iconTool('undo','撤销 [Ctrl+Z]')+iconTool('redo','重做 [Ctrl+Shift+Z]')+'</div><div class="surface-view"><label class="check-label"><input id="grid-view" type="checkbox" checked>网格</label><label class="check-label"><input id="code-view" type="checkbox">色号</label></div></div><div class="canvas-scroll"><div class="canvas-center"><canvas id="work-canvas" tabindex="0" aria-label="拼豆画板，方向键移动，空格编辑"></canvas></div></div><div class="canvas-status"><span id="cursor-info">未选择格子</span><span id="drawing-tools">'+button('','minus','id="zoom-out" aria-label="缩小"','icon-button')+'<button type="button" id="zoom-reset" class="zoom-text" title="恢复到 100%">100%</button>'+button('','plus','id="zoom-in" aria-label="放大"','icon-button')+'</span></div></section><aside class="studio-panel swatches"><div class="panel-title"><h2>色板</h2>'+button('管理','layers','id="manage-palette"','btn small')+'</div><input id="color-search" type="search" aria-label="搜色号" placeholder="搜色号"><div id="current-color"></div><div id="swatch-grid" class="swatch-grid"></div><div class="panel-title materials-title"><h2>用豆清单</h2><span id="material-types" class="muted"></span></div><div id="materials"></div><div class="material-total" id="material-total"></div>'+button('扣减库存','box','id="consume-stock"','btn small wide-btn')+'</aside></div></div>';
  const dom=selector=>$(selector,container);
  const canvas=dom('#work-canvas'), ctx=canvas.getContext('2d');
  const dims=dom('#dimensions'), processing=dom('#process');
  const widthRange=document.createElement('input');
  widthRange.type='range';
  widthRange.min='1';
  widthRange.max=GRID_MAX;
  widthRange.setAttribute('aria-label','调整图纸宽度');
  dims.firstElementChild.after(widthRange);
  const mergeInput=document.createElement('input');
  mergeInput.type='number';
  mergeInput.min='0';
  mergeInput.max='100';
  mergeInput.required=true;
  mergeInput.setAttribute('aria-label','手动输入颜色合并值');
  processing.elements.merge.after(mergeInput);
  const limitButton=document.createElement('button');
  limitButton.type='button';
  limitButton.className='btn small';
  processing.elements.limit.min='1';
  processing.elements.limit.parentElement.after(limitButton);
  processing.querySelector('small').textContent='1–100 色';
  const palette=()=>context.palettes;
  const cellSize=()=>Math.max(8,Math.min(34,Math.floor(760/Math.max(pattern.w,pattern.h))));
  const scroll=dom('.canvas-scroll');
  const scale=()=>Math.min(28,Math.max(30,scroll.clientWidth-48)/pattern.w,Math.max(30,scroll.clientHeight-48)/pattern.h)*zoom/100;
  const observer=new ResizeObserver(()=>draw());
  observer.observe(scroll);
  const status=(str)=>{dom('#save-state').textContent=str;};
  const save=()=>{
    if(timer) clearTimeout(timer);
    timer=null;
    const sequence=++epoch;
    const payload={...state,pattern,settings};
    return Promise.resolve(context.saveLocal(payload)).then(()=>{
      if(sequence===epoch&&!disposed) status('已保存到本机');
    }).catch(error=>{if(!disposed) status('保存失败'); toast(error.message,'error');});
  };
  function autosave(){
    if(disposed)return;
    status('正在保存…');
    clearTimeout(timer);timer=setTimeout(save,420);
  }

  function configure(){
    layerColors=new Map(pattern.palette.map(c=>[c.code,c.hex]));
    if(!layerColors.has(picked)) picked=pattern.cells.find(Boolean)||pattern.palette[0]?.code;
    dims.elements.w.value=pattern.w;dims.elements.h.value=pattern.h;
    widthRange.value=pattern.w;
    dom('#palette-brand').value=pattern.brand;
    dom('#palette-size').value=settings.size;
    dom('#palette-size').disabled=pattern.brand==='自定义';
    processing.elements.mode.value=settings.mode;
    processing.elements.mode.disabled=!source;
    processing.elements.merge.value=settings.merge;
    mergeInput.value=settings.merge;
    processing.elements.limit.value=settings.limit||lastLimit;
    processing.elements.limit.disabled=!settings.limit;
    limitButton.textContent=settings.limit?'关闭颜色上限':'开启颜色上限';
    limitButton.setAttribute('aria-pressed',String(Boolean(settings.limit)));
    dom('#merge-value').textContent=settings.merge;
    updateColors();draw();
  }
  function snapHistory(){ undo.push({pattern,settings}); if(undo.length>45) undo.shift(); redo=[]; }
  function updateHistory(){
    dom('[data-tool=undo]').disabled=!undo.length;
    dom('[data-tool=redo]').disabled=!redo.length;
  }
  function change(next,nextSettings=settings){
    snapHistory();
    pattern=next;settings=nextSettings;state.pattern=pattern;focus=-1;anchor=null;configure();updateHistory();autosave();
  }
  function history(direction){
    const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;
    if(!from.length) return;
    to.push({pattern,settings});
    ({pattern,settings}=from.pop());state.pattern=pattern;dom('#pattern-title').value=pattern.title;focus=-1;anchor=null;configure();updateHistory();autosave();
  }
  function setTool(next){
    tool=next;
    container.querySelectorAll('.toolbar [data-tool]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.tool===tool)));
    canvas.dataset.tool=tool;
    if(tool!=='target') anchor=null;
    draw();
  }
  function draw(){
    if(disposed||invalidated) return;
    invalidated=true;
    pending=requestAnimationFrame(()=>{
      invalidated=false;
      const size=cellSize(), {w,h,cells}=pattern, display=scale();
      if(canvas.width!==w*size||canvas.height!==h*size){ canvas.width=w*size;canvas.height=h*size; }
      canvas.style.width=w*display+'px';canvas.style.height=h*display+'px';
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.font='bold '+Math.max(7,Math.round(size*.38))+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
      const colored=new Map();
      for(const [code,hex] of layerColors){
        const components=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
        colored.set(code,components[0]*.299+components[1]*.587+components[2]*.114>148?'#231e35':'#fff');
      }
      for(let i=0;i<cells.length;i++){
        const color=cells[i], x=(i%w)*size,y=Math.floor(i/w)*size;
        if(!color){ if(((i%w)+Math.floor(i/w))%2){ctx.fillStyle='#f2effa';ctx.fillRect(x,y,size,size);} continue; }
        ctx.fillStyle=layerColors.get(color);ctx.globalAlpha=anchor?.code&&anchor.code!==color?0.24:1;ctx.fillRect(x,y,size,size);
        ctx.globalAlpha=1;
        if(showCodes&&display>=13){ctx.fillStyle=colored.get(color);ctx.fillText(color,x+size/2,y+size/2,size-1);}
      }
      if(showGrid&&display>=4){
        for(const step of [1,5]){
          ctx.strokeStyle=step===1?'#221a4430':'#221a4458';ctx.lineWidth=step===1?1:1.35;ctx.beginPath();
          for(let i=step;i<w;i+=step){ctx.moveTo(i*size+.5,0);ctx.lineTo(i*size+.5,h*size);}
          for(let i=step;i<h;i+=step){ctx.moveTo(0,i*size+.5);ctx.lineTo(w*size,i*size+.5);}
          ctx.stroke();
        }
      }
      if(focus>=0){
        const x=(focus%w)*size,y=Math.floor(focus/w)*size;
        if(anchor){ ctx.fillStyle='#3c2adc24';ctx.fillRect(x,0,size,h*size);ctx.fillRect(0,y,w*size,size); }
        ctx.strokeStyle='#3c2adc';ctx.lineWidth=Math.max(1.5,size/9);ctx.strokeRect(x+1,y+1,size-2,size-2);
      }
    });
  }
  function zoomBy(value){
    zoom=clamp(value,25,400); dom('#zoom-reset').textContent=zoom+'%';draw();
  }
  function updateColors(){
    const search=dom('#color-search').value.trim().toLowerCase();
    dom('#swatch-grid').innerHTML=pattern.palette.filter(c=>c.code.toLowerCase().includes(search)||c.hex.toLowerCase().includes(search)).map(c=>colorItem(c,c.code===picked)).join('')||'<span class="muted">无匹配色号</span>';
    const c=pattern.palette.find(c=>c.code===picked);
    dom('#current-color').innerHTML=c?'<i style="--chip:'+esc(c.hex)+'"></i><strong>'+esc(c.code)+'</strong><span>'+esc(c.hex)+'</span>':'请选择颜色';
    updateMaterials();
  }
  function updateMaterials(){
    const materials=tally(pattern);
    dom('#material-types').textContent=materials.length+' 色';
    dom('#materials').innerHTML=materials.map(c=>'<button type="button" class="material-row" data-locate="'+esc(c.code)+'"><i style="--chip:'+esc(c.hex)+'"></i><b>'+esc(c.code)+'</b><span>'+number(c.count)+' 颗</span></button>').join('')||'<p class="muted">开始绘制后会统计用豆数量。</p>';
    dom('#material-total').innerHTML='<strong>合计</strong><span>'+number(materials.reduce((sum,c)=>sum+c.count,0))+' 颗</span>';
  }
  function updateCursor(i){
    dom('#cursor-info').textContent=i<0?'未选择格子':(i%pattern.w+1)+' 列 · '+(Math.floor(i/pattern.w)+1)+' 行'+(pattern.cells[i]?' · '+pattern.cells[i]:' · 空白');
  }
  function indexAt(e){
    const rect=canvas.getBoundingClientRect();
    const x=Math.floor((e.clientX-rect.left)*pattern.w/rect.width),y=Math.floor((e.clientY-rect.top)*pattern.h/rect.height);
    return x>=0&&y>=0&&x<pattern.w&&y<pattern.h?y*pattern.w+x:-1;
  }
  function cloneForStroke(){
    if(strokeChanged) return;
    snapHistory(); pattern={...pattern,cells:pattern.cells.slice()}; state.pattern=pattern; strokeChanged=true;
  }
  function apply(i,previous=-1){
    if(i<0)return;
    if(tool==='pick'){ if(pattern.cells[i]) {picked=pattern.cells[i];setTool('brush');updateColors();} return; }
    if(tool==='target'){focus=i;anchor={code:pattern.cells[i]||null};updateCursor(i);draw();return;}
    const color=tool==='erase'?null:picked;
    if(color===undefined||(!color&&tool!=='erase')){toast('请先选择颜色','error');return;}
    if(tool==='fill'){
      if(pattern.cells[i]===color) return;
      cloneForStroke();flood(pattern.cells,pattern.w,pattern.h,i,color);draw();return;
    }
    const {w}=pattern;
    const x=i%w,y=Math.floor(i/w),a=previous>=0?previous%w:x,b=previous>=0?Math.floor(previous/w):y;
    const steps=Math.max(1,Math.abs(a-x),Math.abs(b-y));
    for(let n=0;n<=steps;n++){
      const index=Math.round(b+(y-b)*n/steps)*w+Math.round(a+(x-a)*n/steps);
      if(pattern.cells[index]!==color){cloneForStroke();pattern.cells[index]=color;}
    }
    draw();
  }
  function finishStroke(){
    active=false;last=-1;pointerId=null;
    if(strokeChanged){strokeChanged=false;updateHistory();updateMaterials();autosave();}
  }
  canvas.onpointerdown=e=>{
    if(e.button!==0||pointerId!==null)return;
    const i=indexAt(e); if(i<0)return;
    e.preventDefault();canvas.focus({preventScroll:true});
    active=true;last=i;pointerId=e.pointerId;canvas.setPointerCapture(pointerId);
    apply(i);updateCursor(i);
  };
  canvas.onpointermove=e=>{
    const i=indexAt(e);updateCursor(i);
    if(active&&e.pointerId===pointerId&&i>=0&&['brush','erase'].includes(tool)){apply(i,last);last=i;}
  };
  canvas.onpointerup=e=>{if(e.pointerId===pointerId)finishStroke();};
  canvas.onpointercancel=canvas.onpointerup;
  canvas.onlostpointercapture=canvas.onpointerup;
  canvas.onkeydown=e=>{
    let next=focus<0?0:focus;
    if(e.key==='ArrowRight')next++;
    else if(e.key==='ArrowLeft')next--;
    else if(e.key==='ArrowDown')next+=pattern.w;
    else if(e.key==='ArrowUp')next-=pattern.w;
    else if(e.key===' '||e.key==='Enter'){e.preventDefault();apply(next);finishStroke();updateCursor(next);return;}
    else return;
    e.preventDefault();focus=clamp(next,0,pattern.cells.length-1);updateCursor(focus);draw();
  };
  const keydown=e=>{
    if(e.target.matches('input,textarea,select,[contenteditable]')||$('#dialog').open||e.altKey)return;
    if(e.ctrlKey||e.metaKey){
      const key=e.key.toLowerCase();
      if(key==='z'||key==='y'){e.preventDefault();history(e.shiftKey||key==='y'?'redo':'undo');}
      if(key==='s'){e.preventDefault();save();}
      return;
    }
    const match=tools.find(([, ,key])=>key.toLowerCase()===e.key.toLowerCase()); if(match)setTool(match[0]);
  };
  document.addEventListener('keydown',keydown);
  dom('#pattern-title').oninput=e=>{
    pattern={...pattern,title:e.target.value.trim()||'未命名图纸'};state.pattern=pattern;autosave();
  };
  function reprocess(w=pattern.w,h=pattern.h,next=settings){
    if(!source)return reduceColors(resizePattern(pattern,w,h),next.merge,next.limit);
    return imageToPattern(source,w,h,pattern.palette,{...next,extra:{title:pattern.title,brand:pattern.brand,source:'image',tone:pattern.tone}});
  }
  dims.onsubmit=e=>{
    e.preventDefault();
    const w=Number(dims.elements.w.value),h=Number(dims.elements.h.value);
    if(w!==pattern.w||h!==pattern.h) change(reprocess(w,h));
  };
  widthRange.oninput=()=>{
    const w=Number(widthRange.value),crop=settings.crop;
    const ratio=source?(crop?crop[3]/crop[2]:source.height/source.width):pattern.h/pattern.w;
    dims.elements.w.value=w;
    if(source)dims.elements.h.value=clamp(Math.round(w*ratio),1,GRID_MAX);
  };
  widthRange.onchange=()=>dims.requestSubmit();
  const range=processing.elements.merge;
  range.oninput=()=>{mergeInput.value=range.value;dom('#merge-value').textContent=range.value;};
  mergeInput.oninput=()=>{if(mergeInput.checkValidity()){range.value=mergeInput.value;dom('#merge-value').textContent=range.value;}};
  function applyProcessing(next){
    if(next.mode===settings.mode&&next.merge===settings.merge&&next.limit===settings.limit)return;
    change(reprocess(pattern.w,pattern.h,next),next);
  }
  processing.elements.mode.onchange=()=>processing.requestSubmit();
  range.onchange=()=>{if(source)processing.requestSubmit();};
  limitButton.onclick=()=>{
    if(settings.limit)lastLimit=settings.limit;
    applyProcessing({...settings,limit:settings.limit?0:lastLimit});
  };
  processing.onsubmit=e=>{
    e.preventDefault();
    applyProcessing({...settings,mode:processing.elements.mode.value,merge:Number(mergeInput.value),limit:settings.limit?Number(processing.elements.limit.value):0});
  };
  function chooseBrand(brand,size){
    if(brand==='自定义'){change({...pattern,brand});return;}
    const target=paletteSubset(palette()[brand],size);
    change(remapPalette(pattern,target,brand),{...settings,size});
  }
  dom('#palette-brand').onchange=e=>chooseBrand(e.target.value,settings.size);
  dom('#palette-size').onchange=e=>chooseBrand(pattern.brand,Number(e.target.value));
  dom('#color-search').oninput=updateColors;
  dom('#swatch-grid').onclick=e=>{
    const target=e.target.closest('[data-code]');
    if(!target)return;
    picked=target.dataset.code;setTool('brush');
    const active=dom('#swatch-grid .selected');
    active?.classList.remove('selected');active?.setAttribute('aria-pressed','false');
    target.classList.add('selected');target.setAttribute('aria-pressed','true');
    const c=pattern.palette.find(entry=>entry.code===picked);
    dom('#current-color').innerHTML='<i style="--chip:'+esc(c.hex)+'"></i><strong>'+esc(c.code)+'</strong><span>'+esc(c.hex)+'</span>';
  };
  dom('#materials').onclick=e=>{
    const row=e.target.closest('[data-locate]');
    if(!row)return;
    const code=row.dataset.locate;
    setTool('target');
    if(anchor?.code===code){anchor=null;focus=-1;}
    else {anchor={code};focus=pattern.cells.indexOf(code);}
    updateCursor(focus);draw();
  };
  dom('.surface-tools').onclick=e=>{
    const nd=e.target.closest('[data-tool]');
    if(!nd)return;
    const next=nd.dataset.tool;
    if(next==='undo'||next==='redo')history(next);else setTool(next);
  };
  dom('#zoom-in').onclick=()=>zoomBy(zoom+25);
  dom('#zoom-out').onclick=()=>zoomBy(zoom-25);
  dom('#zoom-reset').onclick=()=>zoomBy(100);
  dom('#grid-view').onchange=e=>{showGrid=e.target.checked;draw();};
  dom('#code-view').onchange=e=>{showCodes=e.target.checked;draw();};
  dom('#background').onclick=()=>{
    const next={...pattern,cells:pattern.cells.slice()};
    const n=clearBorder(next);
    if(!n){toast('没有检测到连续的边缘背景','error');return;}
    change(next);toast('已去除 '+number(n)+' 格背景');
  };
  dom('#rotate').onclick=()=>{
    const {w,h}=pattern;
    const cells=Array.from({length:w*h},(_,i)=>pattern.cells[(h-1-i%h)*w+Math.floor(i/h)]);
    change({...pattern,w:h,h:w,cells});
  };
  if(source) dom('#crop').onclick=()=>{
    const {width,height}=source;
    const [x,y,w,h]=settings.crop||[0,0,width,height];
    const dlg=modal('裁剪原图','<div class="crop-preview"><canvas aria-label="裁剪预览"></canvas></div><form class="form-stack"><div class="form-pair"><label>左边距<input type="number" name="x" min="0" max="'+(width-1)+'" value="'+x+'" required></label><label>上边距<input type="number" name="y" min="0" max="'+(height-1)+'" value="'+y+'" required></label></div><div class="form-pair"><label>裁剪宽度<input type="number" name="w" min="1" max="'+width+'" value="'+w+'" required></label><label>裁剪高度<input type="number" name="h" min="1" max="'+height+'" value="'+h+'" required></label></div><button type="submit" class="btn primary">应用裁剪</button></form>');
    const form=$('form',dlg),preview=$('canvas',dlg);
    const region=()=>['x','y','w','h'].map(k=>Number(form.elements[k].value));
    const redraw=()=>{
      const [x0,y0,ww,hh]=region();if(!ww||!hh)return;
      preview.width=Math.max(1,Math.round(230*ww/hh));preview.width=Math.min(420,preview.width);
      preview.height=Math.max(1,Math.round(preview.width*hh/ww));preview.height=Math.min(230,preview.height);
      preview.getContext('2d').drawImage(source,x0,y0,ww,hh,0,0,preview.width,preview.height);
    };
    form.oninput=redraw;redraw();
    formAction(form,()=>{
      const [x0,y0,ww,hh]=region();
      if(x0+ww>width||y0+hh>height) throw Error('裁剪区域超出图片边界');
      const next={...settings,crop:[x0,y0,ww,hh]};
      const nextH=clamp(Math.round(pattern.w*hh/ww),1,GRID_MAX);
      change(reprocess(pattern.w,nextH,next),next);closeModal();
    });
  };
  dom('#replace-color').onclick=()=>{
    const used=tally(pattern);
    if(!used.length){toast('画板上还没有可替换的颜色','error');return;}
    const toOptions=pattern.palette.map(c=>'<option value="'+esc(c.code)+'" '+(c.code===picked?'selected':'')+'>'+esc(c.code)+' · '+esc(c.hex)+'</option>').join('');
    const dlg=modal('替换全部同色格','<form class="form-stack"><label>原色号<select name="from">'+used.map(c=>'<option>'+esc(c.code)+'</option>').join('')+'</select></label><label>目标色号<select name="to">'+toOptions+'<option value="">清除为透明</option></select></label><button type="submit" class="btn primary">替换颜色</button></form>');
    formAction($('form',dlg),form=>{
      const from=textOf(form,'from'),to=textOf(form,'to')||null;
      if(from!==to)change({...pattern,cells:pattern.cells.map(c=>c===from?to:c)});
      closeModal();
    });
  };
  dom('#manage-palette').onclick=()=>{
    const edit=()=>{
      const dlg=modal('色板管理','<p class="muted dialog-copy">当前 '+pattern.palette.length+' 个色号。添加自定义颜色会将图纸切换到自定义色板。</p><form class="form-stack"><div class="form-pair"><label>色号<input name="code" required maxlength="16" pattern="[A-Za-z0-9_\\-]+" placeholder="例如 MY01"></label><label>颜色<input name="hex" type="color" value="#785cf1"></label></div><button type="submit" class="btn primary">添加颜色</button></form><div class="manage-list">'+pattern.palette.map(c=>'<div><i style="--chip:'+esc(c.hex)+'"></i><span>'+esc(c.code)+'</span><code>'+esc(c.hex)+'</code>'+button('','trash','data-remove="'+esc(c.code)+'" aria-label="移除 '+esc(c.code)+'"','icon-button')+'</div>').join('')+'</div>');
      formAction($('form',dlg),form=>{
        const code=textOf(form,'code').toUpperCase(),hex=textOf(form,'hex');
        if(pattern.palette.some(c=>c.code===code))throw Error('色号已经存在');
        if(pattern.palette.length>=400)throw Error('色板最多可保存 400 色');
        change({...pattern,brand:'自定义',palette:[...pattern.palette,{code,hex}]});picked=code;updateColors();edit();
      });
      $('.manage-list',dlg).onclick=e=>{
        const code=e.target.closest('[data-remove]')?.dataset.remove;
        if(!code)return;
        if(pattern.cells.includes(code)){toast('此颜色正在使用，先用替换颜色移除','error');return;}
        change({...pattern,brand:'自定义',palette:pattern.palette.filter(c=>c.code!==code)});edit();
      };
    };
    edit();
  };
  dom('#export').onclick=()=>exportDialog(pattern);
  dom('#cloud-save').onclick=()=>context.saveCloud(state,dom('#cloud-save'),status);
  dom('#publish').onclick=()=>context.publish(state);
  dom('#consume-stock').onclick=()=>{
    if(!context.ensureUser())return;
    const items=tally(pattern);
    if(!items.length){toast('图纸暂无可出库的材料','error');return;}
    const dlg=modal('按用豆数量出库','<p class="dialog-copy">将从 '+esc(pattern.brand)+' 库存扣除 '+number(items.reduce((sum,c)=>sum+c.count,0))+' 颗。任一色号库存不足时，整次出库会取消。</p><form><button type="submit" class="btn primary">确认出库</button></form>');
    formAction($('form',dlg),async()=>{
      await api('/inventory','POST',{brand:pattern.brand,entries:items.map(c=>({code:c.code,amount:-c.count}))});
      closeModal();toast('已按图纸扣减库存');
    });
  };
  setTool('brush');configure();updateHistory();
  if(state.new||!state.cloudId) autosave(); else status('云端项目');
  return ()=>{
    if(timer){clearTimeout(timer); timer=null; save();}
    disposed=true;
    cancelAnimationFrame(pending);
    observer.disconnect();
    document.removeEventListener('keydown',keydown);
  };
}
