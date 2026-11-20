const glyphs = {
  home:'<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  library:'<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M4.5 21v-2a4.5 4.5 0 0 1 4.5-4.5h6a4.5 4.5 0 0 1 4.5 4.5v2"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2.2c-1.5 1-2 1.4-2 2.8m0 3h.01"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.4"/><path d="m3 17 5-4 3 2 4-5 6 6"/>',
  board:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  text:'<path d="M4 6V4h16v2M12 4v16m-4 0h8"/>',
  qr:'<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h3v3h3v3h-6m6-6h.01M12 12h.01"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H5m6-6-6 6 6 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  cloud:'<path d="M6 19a4 4 0 0 1 0-8 6 6 0 0 1 11.5-2.4A5.2 5.2 0 0 1 18 19H6z"/><path d="m9 14 3-3 3 3m-3-3v5"/>',
  brush:'<path d="m14 6 4 4m-8 5-4-4L16 1a2.8 2.8 0 0 1 4 4L10 15zm0 1c-1 4-4 5-8 5 2-1 2-4 3-5s4-2 5 0Z" transform="translate(1 1)"/>',
  erase:'<path d="m7 19-4-4a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-6 6zM7 8l9 9m-4 2h9"/>',
  fill:'<path d="m8 4 8 8M4 13l8-8 8 8-7 7a1.5 1.5 0 0 1-2 0zm2 0h13m1 2s-1.5 2-1.5 3a1.5 1.5 0 0 0 3 0c0-1-1.5-3-1.5-3Z"/>',
  pick:'<path d="m14 6 4 4M4 20l1-5L16 4a3 3 0 0 1 4 4L9 19z"/>',
  undo:'<path d="m8 5-5 5 5 5m-5-5h11a6 6 0 0 1 6 6v2"/>',
  redo:'<path d="m16 5 5 5-5 5m5-5H10a6 6 0 0 0-6 6v2"/>',
  target:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6m4-6v6"/>',
  swap:'<path d="M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4"/>',
  search:'<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  heart:'<path d="M20.8 9.1c0 4.1-8.8 9.5-8.8 9.5S3.2 13.2 3.2 9.1a4.4 4.4 0 0 1 8.8 0 4.4 4.4 0 0 1 8.8 0Z"/>',
  star:'<path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.5l6.2-.9z"/>',
  play:'<path d="m9 5 12 7-12 7z"/>',
  card:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M6 15h5"/>',
  box:'<path d="M3 7h18v4H3zM5 11v9h14v-9m-10 3h6"/>',
  award:'<circle cx="12" cy="9" r="6"/><path d="m8 14-2 7 6-3 6 3-2-7"/>',
  spark:'<path d="M12 2v5m0 10v5M2 12h5m10 0h5M5 5l3 3m8 8 3 3m0-14-3 3m-8 8-3 3"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  eye:'<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  expand:'<path d="M9 4H4v5m11-5h5v5m0 6v5h-5M4 15v5h5"/>',
  rotate:'<path d="M4 10a8 8 0 1 1 2 8m-2-8V5m0 5h5"/>',
  printer:'<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z"/>'
};
export const icon = (name,size=20) => '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(glyphs[name]||glyphs.board)+'</svg>';
export const $ = (selector, parent=document) => parent.querySelector(selector);
export const esc = (value='') => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const date = value => new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
export const number = value => Number(value||0).toLocaleString('zh-CN');
export const textOf = (form,name) => String(new FormData(form).get(name)||'').trim();
export const button = (label,glyph,attrs='',kind='btn') => '<button type="button" class="'+kind+'" '+attrs+'>'+(glyph?icon(glyph,17):'')+label+'</button>';
export const brandLabel = brand=>({ManMan:'漫漫',PanPan:'盼盼',MiXiaoWo:'咪小窝'}[brand]||brand);
export const brandOptions = (list,selected) => list.map(b=>'<option value="'+esc(b)+'" '+(b===selected?'selected':'')+'>'+esc(brandLabel(b))+'</option>').join('');
export function busy(node, fn) {
  if(node.disabled) return;
  node.disabled=true;
  return (async()=>{ try { return await fn(); } catch(error){ toast(error.message,'error'); } finally {node.disabled=false;} })();
}
let toastTimer;
export function toast(message,kind='success'){
  const dialog=$('#dialog');
  if(dialog.open&&kind==='error'){
    let feedback=$('.form-error',dialog);
    if(!feedback){
      feedback=document.createElement('p');
      feedback.className='form-error';
      feedback.setAttribute('role','alert');
      $('.dialog-head',dialog).after(feedback);
    }
    feedback.textContent=message;
    return;
  }
  const element=$('#toast');
  clearTimeout(toastTimer);
  element.className='show '+kind;
  element.textContent=message;
  toastTimer=setTimeout(()=>{element.className='';},4200);
}
export function modal(title,body,{wide=false}={}){
  const dialog=$('#dialog');
  dialog.classList.toggle('wide',wide);
  dialog.innerHTML='<div class="dialog-head"><h2 id="dialog-title">'+esc(title)+'</h2><button type="button" class="icon-button" data-close aria-label="关闭">'+icon('close')+'</button></div>'+body;
  $('[data-close]',dialog).onclick=()=>dialog.close();
  if(!dialog.open) dialog.showModal();
  return dialog;
}
export function closeModal(){ $('#dialog').close(); }
export async function api(path, method='GET', payload) {
  const response=await fetch('/api'+path,{
    method, headers:payload===undefined?{}:{'Content-Type':'application/json'},
    body:payload===undefined?undefined:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw Object.assign(Error(data?.error||'连接失败，请重试'),{status:response.status});
  return data;
}
export function formAction(form,handler){
  form.onsubmit=e=>{
    e.preventDefault();
    $('.form-error',form.closest('dialog')||form)?.remove();
    const submit=e.submitter||$('button[type=submit]',form);
    busy(submit,()=>handler(form));
  };
}
export function downloadBlob(blob,fileName){
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=fileName.replace(/[<>:"/\\|?*\u0000-\u001F]/g,'_');
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function empty(glyph,title,description,action=''){
  return '<div class="empty"><span class="feature-icon lilac">'+icon(glyph,25)+'</span><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p>'+action+'</div>';
}

let dbPromise;
function localDatabase(){
  if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open('bead-studio',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('drafts',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(Error('浏览器存储不可用'));
    req.onblocked=()=>reject(Error('本地草稿被其他窗口占用，请刷新'));
  });
  return dbPromise;
}
export async function drafts(method, value){
  const db=await localDatabase();
  const write=method==='put'||method==='delete';
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('drafts',write?'readwrite':'readonly');
    const store=transaction.objectStore('drafts');
    const request=value===undefined?store[method]():store[method](value);
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=()=>reject(Error('本地草稿保存失败，请检查存储空间'));
    transaction.onerror=()=>reject(Error('本地草稿读取或保存失败'));
  });
}
