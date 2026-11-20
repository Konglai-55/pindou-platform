import { $, icon, esc, button, modal, closeModal, toast, api, formAction, textOf, date, number, empty, drafts, busy, downloadBlob, brandOptions, brandLabel } from './ui.js';
import { categories } from './categories.js';
import { paintPreview } from './preview.js';
import { brands, GRID_MAX, clamp, paletteSubset, createPattern, imageToPattern, validateImported, tally } from './engine.js';
import { mountStudio, loadImage, textPattern, qrPattern, readQR, exportDialog, makeVideo } from './studio.js';

const main=$('#main'), header=$('#header'), footer=$('#footer');
const title='豆格工坊';
const nav=[['/','创作台','home'],['/projects','我的作品','folder'],['/share','图纸库','library'],['/me','我的','user']];
const entry=[
  ['image','图片转图纸','上传照片或像素画，自动匹配色号','image','lilac'],
  ['blank','空白画板','从第一颗豆开始，自由绘制','board','mint'],
  ['text','文字转图纸','把名字、短句做成像素字','text','peach'],
  ['qr','二维码转图纸','生成可扫描的拼豆二维码','qr','blue']
];
let session={}, user=null, palettes={}, cleanup, routing=0, activeDraft=null;
let projectTab='local', profileTab='', library={category:'',q:'',sort:'recommended',mode:'',page:0};
const draftId=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
const localIndex=()=>drafts('getAll').then(items=>items.sort((a,b)=>b.updated-a.updated));
const time=value=>value?date(value):'—';
const ticketState=status=>({open:'待处理',closed:'已结案'}[status]||status);
const categoriesOptions=selected=>categories.map(c=>'<option '+(c===selected?'selected':'')+'>'+esc(c)+'</option>').join('');
const safeLink=(url,label)=>url?'<a href="'+esc(url)+'" rel="noopener noreferrer" target="_blank">'+esc(label)+'</a>':'';
function locationLink(path, label, glyph, cl='btn'){
  return '<a class="'+cl+'" href="'+path+'">'+(glyph?icon(glyph,17):'')+label+'</a>';
}

function frame(){
  const path=location.pathname;
  header.innerHTML='<div class="topbar wrap"><a href="/" class="identity" aria-label="豆格工坊首页"><img src="/favicon.svg" alt="" width="37" height="37"><b>豆格<span>工坊</span></b></a><nav class="main-nav" aria-label="主要导航">'+nav.map(([url,label,glyph])=>'<a href="'+url+'" '+((url==='/'&&(path==='/'||path==='/studio'))||(url!=='/'&&path.startsWith(url))?'aria-current="page"':'')+'>'+icon(glyph,17)+label+'</a>').join('')+'</nav><div class="head-actions"><a href="/help" class="guide" title="使用帮助">'+icon('help',17)+'<span>使用帮助</span></a>'+(user?'<a href="/me" class="btn account" title="我的账号"><span class="avatar mini">'+esc([...user.name][0])+'</span><span>'+esc(user.name)+'</span></a>':button('登录 / 注册','user','id="header-login"','btn account'))+'</div></div>';
  if(!user) $('#header-login').onclick=()=>auth();
  footer.innerHTML='<div class="wrap footer-inner"><a href="/" class="identity small-logo"><img src="/favicon.svg" width="27" height="27" alt=""><b>豆格工坊</b></a><span>© '+new Date().getFullYear()+' 豆格工坊</span><nav aria-label="更多">'+locationLink('/gywm.html','关于我们',null,'footer-link')+locationLink('/lxwm.html','联系与反馈',null,'footer-link')+'</nav></div>';
}

async function navigate(href){
  const to=new URL(href,location.origin);
  if(to.origin!==location.origin) return;
  if(to.href!==location.href) history.pushState(null,'',to.pathname+to.search+to.hash);
  await render();
  if(to.hash==='#tutorial')$('#tutorial')?.scrollIntoView();
  else window.scrollTo(0,0);
}
function backAware(){ render().catch(e=>toast(e.message,'error')); }
window.addEventListener('popstate',backAware);
document.addEventListener('click',e=>{
  const anchor=e.target.closest('a[href]');
  if(!anchor||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||anchor.target||anchor.download||anchor.getAttribute('href').startsWith('#'))return;
  const url=new URL(anchor.href,location.href);
  if(url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  e.preventDefault();navigate(url.href).catch(error=>toast(error.message,'error'));
});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')) closeModal();});

function auth(mode='login',resume) {
  const join=mode==='register', recover=mode==='recover', lookup=mode==='lookup';
  const setup=join&&new URLSearchParams(location.search).get('setup')==='1';
  if(lookup){
    const dlg=modal('查询卡密绑定','<form class="form-stack"><label>卡密<input name="code" required maxlength="80"></label><button type="submit" class="btn primary">查询绑定</button></form><p class="dialog-foot" id="binding-result" role="status"></p>'+button('返回登录',null,'id="back-to-login"','text-btn'));
    $('#back-to-login',dlg).onclick=()=>auth('login',resume);
    formAction($('form',dlg),async form=>{
      const out=await api('/card-binding','POST',{code:textOf(form,'code')});
      $('#binding-result',dlg).textContent='已绑定至 '+out.account;
    });
    return;
  }
  const dlg=modal(recover?'重置密码':'登录豆格工坊',
    (!recover?'<div class="tabs dialog-tabs" aria-label="账号操作">'+button('登录',null,'data-auth="login"','tab '+(!join?'active':''))+button('注册',null,'data-auth="register"','tab '+(join?'active':''))+'</div>':'')+
    '<form class="form-stack"><label>用户名<input name="account" maxlength="32" autocomplete="username" required pattern="[A-Za-z0-9_-]{2,32}" placeholder="2–32 位字母、数字、下划线或短横线"></label>'+
    (join?'<label>昵称<input name="name" maxlength="30" autocomplete="nickname" required placeholder="图纸库显示的名字"></label>':'')+
    (join?'<label>绑定卡密（创作前必须激活）<input name="card" maxlength="80" autocomplete="off" placeholder="输入平台发放的卡密"></label>':'')+
    (setup?'<label>管理员注册密钥<input type="password" name="adminSecret" required autocomplete="off"></label>':'')+
    (recover?'<label>账号恢复码<input name="recovery" maxlength="64" autocomplete="off" required placeholder="注册时保存的恢复码"></label>':'')+
    '<label>'+(recover?'新密码':'密码')+'<input type="password" name="password" required minlength="8" maxlength="64" autocomplete="'+(join||recover?'new-password':'current-password')+'" placeholder="8–64 个字符"></label>'+
    '<button type="submit" class="btn primary wide-btn">'+(join?'创建账号':recover?'重置并登录':'登录')+'</button></form>'+
    (join?'<p class="muted dialog-foot">注册后可查看图纸库。生成、编辑和发布图纸前必须激活有效卡密。</p>':button(recover?'返回登录':'忘记密码？',null,'id="auth-more"','text-btn dialog-foot'))+
    (!join&&!recover?button('查询卡密绑定',null,'id="auth-lookup"','text-btn dialog-foot'):''));
  $('#auth-lookup',dlg)?.addEventListener('click',()=>auth('lookup',resume));
  dlg.querySelectorAll('[data-auth]').forEach(x=>x.onclick=()=>auth(x.dataset.auth,resume));
  $('#auth-more',dlg)?.addEventListener('click',()=>auth(recover?'login':'recover',resume));
  formAction($('form',dlg),async form=>{
    const payload={account:textOf(form,'account'),password:form.elements.password.value};
    if(join)Object.assign(payload,{name:textOf(form,'name'),card:textOf(form,'card'),adminSecret:textOf(form,'adminSecret')});
    if(recover)payload.recovery=textOf(form,'recovery');
    const output=await api(join?'/register':recover?'/recover':'/login','POST',payload);
    user=output.user;frame();
    const next=async()=>{
      closeModal();
      if(resume)await resume();
      else if(location.pathname!=='/studio')await render();
    };
    if(output.recovery){
      const box=modal('保存账号恢复码','<p class="dialog-copy">恢复码用于重置密码，请妥善保存。页面关闭后将无法再次查看这串恢复码。</p><pre class="secret-code">'+esc(output.recovery)+'</pre><div class="dialog-actions">'+button('下载恢复码','download','id="save-recovery"')+button('完成','check','id="auth-complete"','btn primary')+'</div>');
      $('#save-recovery',box).onclick=()=>downloadBlob(new Blob(['豆格工坊账号恢复码\n'+user.account+'\n'+output.recovery+'\n'],{type:'text/plain;charset=utf-8'}),'豆格工坊-账号恢复码.txt');
      $('#auth-complete',box).onclick=()=>next().catch(error=>toast(error.message,'error'));
    }else {await next();toast('已登录');}
  });
}

function profile(){
  const shortcuts=[
    ['wallet','积分钱包','card','积分余额与收支','lilac'],
    ['inventory','材料库存','box','管理色号和出入库','mint'],
    ['creator','创作者中心','award','查看已发布图纸的数据','peach'],
    ['favorites','我的收藏','star','回看喜欢的图纸','blue'],
    ['tutorial','视频教程','play','从零开始做一张图纸','lilac'],
    ['prompts','AI 生图口令','spark','用于生成适合转图纸的底图','mint'],
    ['member','创作卡密','card','查询权益与激活卡密','peach'],
    ['community','联系与交流','mail','反馈问题和访问社群','blue']
  ];
  if(user?.role==='admin')shortcuts.push(['admin','平台管理','layers','发放卡密、管理图纸及反馈','mint']);
  main.innerHTML='<div class="wrap inner">'+pageHead('','我的工坊','在这里管理账号、材料和公开图纸。')+'<div class="profile-panel">'+userCard()+'<div class="head-buttons">'+(user?button('编辑资料','brush','id="edit-profile"')+button('退出登录',null,'id="logout"','text-btn'):button('登录 / 注册','user','id="profile-login"','btn primary'))+'</div></div><div class="profile-grid">'+shortcuts.map(([key,name,glyph,desc,tone])=>'<button type="button" class="profile-card" data-profile="'+key+'"><span class="feature-icon '+tone+'">'+icon(glyph,21)+'</span><span><strong>'+name+'</strong><small>'+desc+'</small></span>'+icon('chevron',17)+'</button>').join('')+'</div><section id="profile-tab"></section></div>';
  $('#profile-login')?.addEventListener('click',()=>auth());
  $('#logout')?.addEventListener('click',e=>busy(e.currentTarget,async()=>{await api('/logout','POST',{});user=null;profileTab='';toast('已退出登录');await render();}));
  $('#edit-profile')?.addEventListener('click',()=>{
    const dlg=modal('编辑资料','<form class="form-stack"><label>昵称<input name="name" maxlength="30" required value="'+esc(user.name)+'"></label><button type="submit" class="btn primary">保存昵称</button></form>');
    formAction($('form',dlg),async form=>{user=(await api('/profile','PATCH',{name:textOf(form,'name')})).user;closeModal();await render();toast('昵称已更新');});
  });
  main.querySelectorAll('[data-profile]').forEach(btn=>btn.onclick=()=>openProfileTab(btn.dataset.profile));
  if(['wallet','inventory','creator'].includes(profileTab)&&user) showProfileTab(profileTab).catch(error=>toast(error.message,'error'));
}

function openProfileTab(tab){
  if(tab==='tutorial'){navigate('/help#tutorial');return;}
  if(tab==='prompts'){prompts();return;}
  if(tab==='member'){
    if(!ensureUser(()=>openProfileTab(tab)))return;
    const expiry=user.expires>=253402214400000?'永久':user.expires>0?time(user.expires):'—';
    const dlg=modal('创作权益','<dl class="detail-spec"><div><dt>卡密状态</dt><dd>'+ (user.member?'已激活':'未激活')+'</dd></div><div><dt>有效期</dt><dd>'+expiry+'</dd></div></dl><div class="dialog-actions">'+button('激活卡密','card','id="activate-card"','btn primary')+'</div>');
    $('#activate-card',dlg).onclick=()=>redeem();return;
  }
  if(tab==='community'){navigate('/lxwm.html');return;}
  if(tab==='admin'){navigate('/admin');return;}
  const launch=async()=>{
    if(tab==='favorites'){library={...library,mode:'favorites',page:0,q:'',category:''};await navigate('/share');return;}
    await showProfileTab(tab,true);
  };
  if(ensureUser(launch))launch().catch(error=>toast(error.message,'error'));
}
const table=(headers,rows)=>'<div class="table-scroll"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(cells=>'<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const signed=value=>(value>0?'+':'')+number(value);
async function showProfileTab(tab,scroll=false){
  profileTab=tab;
  const node=$('#profile-tab');
  if(!node)return;
  node.innerHTML='<div class="loading">正在读取数据…</div>';
  const data=await api({wallet:'/wallet',inventory:'/inventory',creator:'/projects'}[tab]);
  if(!node.isConnected||profileTab!==tab)return;
  if(tab==='wallet'){
    user.points=data.points;
    node.innerHTML=sectionHead('积分钱包','图纸获取、收入和奖励记录。')+'<div class="balance-card"><span>可用积分</span><strong>'+number(data.points)+'</strong></div>'+(data.items.length?table(['项目','积分变动','日期'],data.items.map(i=>[esc(i.note),signed(i.amount),time(i.created)])):'<p class="muted">暂无记录。</p>');
  }
  if(tab==='inventory'){
    node.innerHTML=sectionHead('材料库存','按品牌管理色号。编辑器可以按图纸用量一次扣减库存。')+'<form class="stock-form"><label>品牌<select name="brand">'+brandOptions(brands,'MARD')+'</select></label><label>色号<input name="code" list="stock-codes" maxlength="16" required placeholder="例如 A1"><datalist id="stock-codes"></datalist></label><label>操作<select name="direction"><option value="in">入库</option><option value="out">出库</option></select></label><label>数量<input name="count" type="number" min="1" max="9999999" value="100" required></label><button type="submit" class="btn primary">记录变动</button></form><div class="inventory-columns"><section><h3>当前库存</h3>'+(data.items.length?table(['品牌','色号','数量'],data.items.map(i=>[esc(brandLabel(i.brand)),esc(i.code),number(i.amount)+' 颗'])):'<p class="muted">还没有色号入库。</p>')+'</section><section><h3>出入库记录</h3>'+(data.history.length?table(['色号','变动','日期'],data.history.map(i=>[esc(i.code),signed(i.amount),time(i.created)])):'<p class="muted">暂无记录。</p>')+'</section></div>';
    const form=$('form',node);
    const showCodes=()=>{
      $('#stock-codes',form).innerHTML=(palettes[form.elements.brand.value]||[]).map(([c])=>'<option value="'+esc(c)+'"></option>').join('');
    };
    form.elements.brand.onchange=showCodes;showCodes();
    formAction(form,async form=>{
      const brand=textOf(form,'brand'),entered=textOf(form,'code');
      const code=brand==='自定义'?entered:palettes[brand].find(c=>c[0].toLowerCase()===entered.toLowerCase())?.[0]||entered;
      const amount=Number(form.elements.count.value)*(form.elements.direction.value==='out'?-1:1);
      await api('/inventory','POST',{brand,code,amount});
      toast('库存已更新');await showProfileTab('inventory');
    });
  }
  if(tab==='creator'){
    const items=data.items.filter(p=>p.public), total=name=>number(items.reduce((sum,p)=>sum+p[name],0));
    node.innerHTML=sectionHead('创作者中心','你发布的图纸及社区互动。',locationLink('/projects','管理作品','folder'))+'<dl class="detail-spec creator-spec"><div><dt>图纸</dt><dd>'+number(items.length)+'</dd></div><div><dt>预览</dt><dd>'+total('views')+'</dd></div><div><dt>保存</dt><dd>'+total('saves')+'</dd></div><div><dt>点赞</dt><dd>'+total('likes')+'</dd></div></dl>'+(items.length?table(['图纸','预览','保存','点赞'],items.map(p=>[locationLink('/share/'+p.id,esc(p.title),null,'text-btn'),number(p.views),number(p.saves),number(p.likes)])):'<p class="muted">发布第一张图纸后会显示在这里。</p>');
  }
  if(scroll)node.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}

function prompts(){
  const templates=[
    ['复古像素图标','生成一个正面居中的像素图标，主体轮廓清晰，32×32 像素设计，最多 8 个实色，透明或纯色背景，关闭抗锯齿和渐变，主体周围留出空间。主体：'],
    ['黑白线条','创建粗线条黑白剪影，主体保持完整，白色纯背景，无阴影、材质和细碎装饰，适配 48×48 拼豆画板。主体：'],
    ['糖果色手作图','绘制方形网格像素画，用 6 种糖果色，主轮廓用深色分隔，保留大块填色区域，40×40 像素，留足边界，不加入文字或水印。主体：']
  ];
  const dlg=modal('AI 生图口令','<p class="dialog-copy muted">把口令复制到你使用的生图工具，补上想做的主体，再上传生成的底图。</p><div class="prompt-list">'+templates.map(([name,prompt],i)=>'<article><h3>'+name+'</h3><p>'+prompt+'</p>'+button('复制口令',null,'data-prompt="'+i+'"','btn small')+'</article>').join('')+'</div>',{wide:true});
  dlg.querySelectorAll('[data-prompt]').forEach(btn=>btn.onclick=()=>busy(btn,async()=>{
    if(navigator.clipboard)await navigator.clipboard.writeText(templates[Number(btn.dataset.prompt)][1]);
    else{
      const input=document.createElement('textarea');input.value=templates[Number(btn.dataset.prompt)][1];dlg.append(input);input.select();document.execCommand('copy');input.remove();
    }
    toast('口令已复制');
  }));
}
function help(){
  main.innerHTML='<div class="wrap inner">'+pageHead('','使用帮助','从选图到开拼，跟着步骤做一遍。')+
    '<div class="help-layout" id="tutorial"><div class="tutorial-art"><span class="feature-icon blue">'+icon('board',42)+'</span><p class="muted">上传图片后会在这里生成你的专属图纸。</p></div><div class="tutorial-content"><h2>做一张拼豆图纸</h2><ol><li><strong>选一张底图</strong><p>上传清晰的照片或像素画，也可以从空白画板开始。</p></li><li><strong>选品牌和尺寸</strong><p>把色板切到手头的拼豆品牌，调整尺寸、颜色上限和合并值。</p></li><li><strong>检查后导出</strong><p>用画笔改掉杂色，看用豆清单备料，再导出带色号的图纸。</p></li></ol>'+button('开始创作','plus','data-new','btn primary')+'</div></div>'+
    '<section class="faq">'+sectionHead('常见问题')+[
      ['图片会上传吗？','原图在浏览器里处理和保存在本地草稿。选择存到云端或发布时，服务端接收编辑后的图纸、色板和图纸信息。'],
      ['为什么实物与屏幕有色差？','各品牌色值来自公开社区色卡。屏幕设置与批次也会影响颜色，备料时可对照实物。'],
      ['怎样导出 PDF？','点击编辑器的导出图纸，选「打印 / PDF」，再从浏览器打印窗口选择另存为 PDF。'],
      ['拼豆二维码怎样更容易扫描？','使用深浅对比明显的豆子，保留四周留白，压平后从正上方扫描。改变格数、颜色或擦除格子会影响识别。']
    ].map(([q,a])=>'<details><summary>'+q+'</summary><p>'+a+'</p></details>').join('')+'<div class="dialog-actions">'+button('AI 生图口令','spark','id="help-prompts"')+button('激活创作卡密','card','id="help-card"')+locationLink('/lxwm.html','联系与反馈','mail')+'</div></section></div>';
  installCreation(main);
  $('#help-prompts').onclick=prompts;$('#help-card').onclick=()=>redeem();
}
function about(){
  main.innerHTML='<div class="wrap inner info-page">'+pageHead('','关于豆格工坊','把图片变成可以一格格照着拼的制作图。')+'<article class="info-card"><h2>做图、改图、备豆</h2><p>用照片、文字或二维码生成拼豆图纸，也可以从空白格子开始。工作台会统计每个色号的用量，让你按表格备料和制作。</p><h2>一起分享图纸</h2><p>注册后可跨设备保存作品。发布图纸可供他人预览、收藏和保存副本。图纸库的示例由豆格工坊绘制。</p><h2>色板数据</h2><p>五品牌配色使用公开社区色卡。不同屏幕和拼豆批次可能有色差，购买材料时请与手中的实物色卡核对。</p></article></div>';
}
function support(){
  main.innerHTML='<div class="wrap inner info-page">'+pageHead('','联系与反馈','使用、卡密、图纸或合作相关问题，都可以在这里留言。')+'<div class="info-card"><form id="support-form" class="form-stack"><label>联系方式<input required maxlength="120" name="contact" value="'+esc(user?.account||'')+'" placeholder="输入用户名或其他联系方式"></label><label>主题<input required maxlength="90" name="subject" placeholder="例如：图纸导出问题"></label><label>详细描述<textarea required maxlength="1000" rows="5" name="body" placeholder="说明使用的功能和遇到的问题"></textarea></label><button type="submit" class="btn primary">'+icon('mail',16)+' 提交反馈</button></form>'+(session.support||session.community?'<div class="dialog-actions">'+(session.support?'<a class="text-btn" href="mailto:'+esc(session.support)+'">'+esc(session.support)+'</a>':'')+safeLink(session.community,'加入官方社群')+'</div>':'')+'</div></div>';
  formAction($('#support-form'),async form=>{
    await api('/support','POST',{contact:textOf(form,'contact'),subject:textOf(form,'subject'),body:textOf(form,'body')});
    form.reset();toast('反馈已提交');
  });
}
function cardListModal(cards){
  const dlg=modal('卡密已生成','<p class="dialog-copy muted">请立即复制或下载，卡密仅显示这一次。</p><pre class="secret-code">'+cards.map(esc).join('\n')+'</pre><div class="dialog-actions">'+button('下载卡密','download','id="download-cards"','btn primary')+'</div>');
  $('#download-cards',dlg).onclick=()=>downloadBlob(new Blob([cards.join('\n')],{type:'text/plain'}),'豆格工坊-卡密.txt');
}
async function adminPage(gen){
  main.innerHTML='<div class="wrap inner">'+pageHead('','平台管理','发放卡密、管理图纸和处理反馈。')+'<div id="admin-content" class="loading">正在读取…</div></div>';
  if(!user){
    const node=$('#admin-content');node.classList.remove('loading');
    node.innerHTML=empty('user','请先登录','平台管理需要管理员账号。',button('登录','user','id="admin-login"','btn primary'));
    $('#admin-login').onclick=()=>auth();return;
  }
  const out=await api('/admin');
  if(gen!==routing)return;
  const node=$('#admin-content');node.classList.remove('loading');
  node.innerHTML='<section class="info-card" id="admin-cards"><h2>生成卡密</h2><form class="stock-form"><label>有效天数（0 为永久）<input name="duration" type="number" min="0" max="365" value="7" required></label><label>数量<input name="count" type="number" min="1" max="50" value="1" required></label><button type="submit" class="btn primary">生成</button></form></section><section class="admin-section">'+sectionHead('用户反馈')+
    (out.tickets.length?table(['主题','联系方式','描述','状态','操作'],out.tickets.map(t=>[esc(t.subject),esc(t.contact),esc(t.body),esc(ticketState(t.status)),t.status==='open'?button('结案',null,'data-close-ticket="'+esc(t.id)+'"','btn small'):'—'])):'<p class="muted">暂无反馈。</p>')+'</section><section class="admin-section">'+sectionHead('社区图纸管理')+
    (out.projects.length?table(['图纸','作者','预览','操作'],out.projects.map(p=>[locationLink('/share/'+p.id,esc(p.title),null,'text-btn'),esc(p.author),number(p.views),button(p.featured?'已推荐':'推荐',null,'data-feature="'+esc(p.id)+'" '+(p.featured?'disabled':''),'btn small')+' '+button('下架',null,'data-hide="'+esc(p.id)+'"','btn small')])):'<p class="muted">暂无用户发布的图纸。</p>')+'</section>';
  formAction($('#admin-cards form'),async form=>{
    const {cards}=await api('/admin/cards','POST',{duration:Number(form.elements.duration.value),count:Number(form.elements.count.value)});
    cardListModal(cards);
  });
  node.onclick=e=>{
    const b=e.target.closest('button');if(!b)return;
    const ticket=b.dataset.closeTicket,project=b.dataset.feature||b.dataset.hide;
    if(!ticket&&!project)return;
    const action=ticket?'ticket':'project',id=ticket||project;
    const featured=Boolean(b.dataset.feature);
    const dlg=modal(b.textContent.trim(),'<p class="dialog-copy">确认执行这项操作？</p><form><button type="submit" class="btn primary">确认</button></form>');
    formAction($('form',dlg),async()=>{await api('/admin/'+action,'POST',{id,featured});closeModal();toast('操作已完成');await render();});
  };
}
async function render(){
  cleanup?.();cleanup=null;
  const gen=++routing;
  frame();
  const path=location.pathname.replace(/\/$/,'')||'/';
  document.body.classList.toggle('studio-page',path==='/studio');
  const names={'/':'拼豆图纸工作台','/projects':'我的作品','/studio':'图纸编辑器','/share':'图纸库','/me':'我的工坊','/help':'使用帮助','/admin':'平台管理','/lxwm.html':'联系与反馈','/gywm.html':'关于我们'};
  document.title=(names[path]||(path.startsWith('/share/')?'图纸详情':'拼豆平台'))+' · '+title;
  try{
    if(path==='/')await home();
    else if(path==='/projects')await projects(gen);
    else if(path==='/studio')await studio(gen,new URLSearchParams(location.search));
    else if(path==='/share'){library.page=0;await libraryPage(gen);}
    else if(path.startsWith('/share/'))await detail(gen,path.split('/')[2]);
    else if(path==='/me')profile();
    else if(path==='/help')help();
    else if(path==='/gywm.html')about();
    else if(path==='/lxwm.html')support();
    else if(path==='/admin')await adminPage(gen);
    else main.innerHTML='<div class="wrap inner">'+empty('help','页面未找到','从创作台开始新的图纸。',locationLink('/','回创作台','home'))+'</div>';
  }catch(error){
    if(gen===routing)main.innerHTML='<div class="wrap inner">'+empty('help','打开失败',error.message,locationLink('/','回创作台','home'))+'</div>';
  }
}
async function init(){
  frame();
  main.innerHTML='<div class="wrap loading">正在打开工坊…</div>';
  try{
    [session,palettes]=await Promise.all([api('/session'),fetch('/palettes.json').then(r=>{if(!r.ok)throw Error('无法读取色板');return r.json();})]);
    user=session.user;
    await render();
  }catch(error){
    main.innerHTML='<div class="wrap inner">'+empty('help','无法加载工坊',error.message,button('重新加载',null,'id="init-retry"','btn primary'))+'</div>';
    $('#init-retry').onclick=init;
  }
}
function ensureUser(resume){
  if(user)return true;
  auth('login',resume);
  return false;
}
function checkCreate(resume){
  if(!session.requireMembership||user?.member)return true;
  if(!ensureUser(()=>redeem(resume)))return false;
  redeem(resume);
  return false;
}
function redeem(resume){
  if(!ensureUser(()=>redeem(resume)))return;
  const dlg=modal('激活创作卡密','<p class="dialog-copy muted">卡密只能使用一次。'+(session.shop?'可以前往本站的购卡渠道。':'卡密由平台管理员发放。')+'</p><form class="form-stack"><label>卡密<input name="code" maxlength="80" required autocomplete="off" placeholder="输入完整卡密"></label><button type="submit" class="btn primary">激活卡密</button></form>'+(session.shop?'<p class="dialog-foot">'+safeLink(session.shop,'前往购卡')+'</p>':''));
  formAction($('form',dlg),async form=>{
    user=(await api('/redeem','POST',{code:textOf(form,'code')})).user;
    closeModal();toast('卡密已激活');frame();
    if(resume)await resume();else if(location.pathname!=='/studio')await render();
  });
}
const defaultPalette=()=>paletteSubset(palettes.MARD);
async function start(pattern, extras={}){
  if(!checkCreate(()=>start(pattern,extras)))return;
  const draft={id:draftId(),pattern,updated:Date.now(),new:true,...extras};
  await saveLocal(draft);
  activeDraft=draft;
  closeModal();await navigate('/studio?draft='+draft.id);
}
async function saveLocal(state){
  const {id,pattern,cloudId,original,settings}=state;
  return drafts('put',{id,pattern,cloudId,original,settings,updated:Date.now()});
}
const cloudWrites=new WeakMap();
async function storeCloud(state){
  const owner=user.id;
  const previous=cloudWrites.get(state)||Promise.resolve();
  const write=previous.catch(()=>{}).then(async()=>{
    if(user?.id!==owner)throw Error('账号已切换，请重新保存图纸');
    const pattern=state.pattern, id=state.cloudId;
    if(id){
      try { await api('/projects/'+id,'PATCH',pattern); return id; }
      catch(error){ if(error.status!==404)throw error; }
    }
    const result=await api('/projects','POST',pattern);
    state.cloudId=result.id;
    await saveLocal(state).catch(error=>toast(error.message,'error'));
    return result.id;
  });
  cloudWrites.set(state,write);
  return write;
}
function saveCloud(state,node,status){
  if(!ensureUser(()=>saveCloud(state,node,status))||!checkCreate(()=>saveCloud(state,node,status)))return;
  return busy(node,async()=>{
    await storeCloud(state);status('已存到云端');toast('已存到云端');
  });
}
async function publish(state){
  try {
    if(!ensureUser(()=>publish(state))||!checkCreate(()=>publish(state)))return;
    const project=state.cloudId?(await api('/projects/'+state.cloudId)).project:null;
    const dlg=modal(project?.public?'管理已发布图纸':'发布到图纸库','<p class="dialog-copy muted">公开图纸可预览、收藏或保存副本。免费图纸可直接使用。</p><form class="form-stack"><label>题材<select name="category">'+categoriesOptions(project?.category||'其他')+'</select></label><label>介绍<textarea name="description" maxlength="300" rows="3" placeholder="告诉大家这张图纸的做法或灵感">'+esc(project?.description||'')+'</textarea></label><label>获取所需积分<input type="number" name="price" value="'+(project?.price||0)+'" min="0" max="9999" required></label><label class="check-label"><input type="checkbox" name="public" checked>公开到图纸库</label><button type="submit" class="btn primary">保存发布设置</button></form>');
    formAction($('form',dlg),async form=>{
      const id=await storeCloud(state);
      await api('/projects/'+id+'/public','POST',{public:form.elements.public.checked,category:textOf(form,'category'),description:textOf(form,'description'),price:Number(form.elements.price.value)});
      closeModal();toast(form.elements.public.checked?'图纸已发布':'图纸已设为私有');
    });
  } catch(error){toast(error.message,'error');}
}
function newOptions(){
  if(!checkCreate(newOptions))return;
  const dlg=modal('选择创作方式','<div class="creation-dialog">'+entry.map(([id,label,desc,glyph,color])=>'<button type="button" data-create="'+id+'"><span class="feature-icon '+color+'">'+icon(glyph)+'</span><span><b>'+label+'</b><small>'+desc+'</small></span>'+icon('chevron',17)+'</button>').join('')+'</div>');
  dlg.querySelectorAll('[data-create]').forEach(node=>node.onclick=()=>createDialog(node.dataset.create));
}
function createDialog(kind){
  if(!checkCreate(()=>createDialog(kind)))return;
  if(kind==='image'){closeModal();$('#image-input').click();return;}
  const names={blank:'新建空白画板',text:'文字转图纸',qr:'二维码转图纸'};
  const qr=kind==='qr';
  const formBody=kind==='blank'?'<p class="dialog-copy muted">设置图纸的行列数。进入画板后可以随时调整。</p>':qr?'<p class="dialog-copy muted">输入内容或识别现有二维码。拼制时保持深浅色块和外围空白。</p>':'';
  const dlg=modal(names[kind],formBody+'<form class="form-stack">'+
    (kind==='text'?'<label>文字<textarea name="text" rows="3" required maxlength="160" placeholder="例如：今天也很棒"></textarea></label>':qr?'<label>链接或文字<textarea name="text" maxlength="1200" required rows="3" placeholder="https:// 或任意短句"></textarea></label><label>纠错等级<select name="level"><option value="M">M · 标准</option><option value="Q">Q · 较高</option><option value="H">H · 高</option><option value="L">L · 较低</option></select></label><label>识别二维码图片<input id="qr-upload" type="file" accept="image/*"></label>':'')+
    (qr?'':'<div class="form-pair"><label>宽度（格）<input name="w" type="number" min="1" max="250" required value="'+(kind==='blank'?100:60)+'"></label><label>高度（格）<input name="h" type="number" min="1" max="250" required value="'+(kind==='blank'?100:30)+'"></label></div>')+
    '<button class="btn primary" type="submit">'+icon('plus',17)+' 生成图纸</button></form>');
  if(qr) $('#qr-upload',dlg).onchange=async e=>{
    try {
      if(!e.target.files[0])return;
      $('textarea',dlg).value=readQR(await loadImage(e.target.files[0]));
      toast('已识别二维码内容');
    }catch(error){toast(error.message,'error');}
  };
  formAction($('form',dlg),async form=>{
    const w=Number(form.elements.w?.value),h=Number(form.elements.h?.value),text=textOf(form,'text');
    if(kind!=='blank'&&!text)throw Error('请输入内容');
    const pattern=qr?qrPattern(text,textOf(form,'level')):kind==='text'?textPattern(text,w,h,defaultPalette()):createPattern(w,h,defaultPalette());
    await start(pattern);
  });
}
async function imageStart(file){
  if(!file||!checkCreate(()=>imageStart(file)))return;
  try{
    const image=await loadImage(file);
    const w=50,h=clamp(Math.round(w*image.height/image.width),1,GRID_MAX);
    const settings={merge:30};
    const pattern=imageToPattern(image,w,h,defaultPalette(),{...settings,extra:{title:file.name.replace(/\.[^.]+$/,'').slice(0,60)||'图片图纸',source:'image'}});
    await start(pattern,{image,settings,original:image.toDataURL('image/webp',.92)});
  }catch(error){toast(error.message,'error');}
}
$('#image-input').onchange=e=>{const file=e.target.files[0];e.target.value='';imageStart(file);};
async function restoreSource(record){
  if(!record.original||record.image)return;
  try{
    const image=new Image();
    image.src=record.original;
    await image.decode();record.image=image;
  }catch{}
}

function installCreation(root){
  root.querySelectorAll('[data-create]').forEach(node=>node.onclick=()=>createDialog(node.dataset.create));
  root.querySelectorAll('[data-new]').forEach(node=>node.onclick=newOptions);
}
function sectionHead(title, caption='', action=''){
  return '<div class="section-head"><div><h2>'+title+'</h2>'+(caption?'<p>'+caption+'</p>':'')+'</div>'+action+'</div>';
}
function pageHead(name,title,desc,action=''){
  return '<header class="page-head"><div>'+(name?'<p class="crumb">'+name+'</p>':'')+'<h1>'+title+'</h1><p>'+desc+'</p></div>'+action+'</header>';
}
function userCard(){
  return user?'<div class="account-summary"><span class="avatar">'+esc([...user.name][0])+'</span><div><h2>'+esc(user.name)+'</h2><p>'+esc(user.account)+'</p></div></div>':'<div class="account-summary"><span class="avatar">'+icon('user',28)+'</span><div><h2>登录工作室</h2><p>同步作品和收藏，记录你的用豆库存。</p></div></div>';
}
function patternCard(record, kind='public'){
  const pattern=record.pattern||record;
  const remote=kind==='remote';
  const {id}=record, isLocal=kind==='local', builtIn=kind==='seed', mine=isLocal||kind==='cloud';
  const href=isLocal?'/studio?draft='+encodeURIComponent(id):kind==='cloud'?'/studio?cloud='+encodeURIComponent(id):'/share/'+encodeURIComponent(id);
  const linkAttrs='';
  const colors=pattern.palette&&pattern.cells?tally(pattern).length:record.colors||0;
  const beads=record.beads!==undefined?record.beads:pattern.cells?.filter(Boolean).length;
  const preview=mine&&isLocal?'<canvas data-draft-preview="'+esc(id)+'" aria-hidden="true"></canvas>':builtIn?'<canvas data-seed="'+esc(id)+'" aria-hidden="true"></canvas>':remote?'<img loading="lazy" src="'+esc(record.preview)+'" alt="">':'<img loading="lazy" src="/api/projects/'+encodeURIComponent(id)+'/preview" alt="">';
  const size=pattern.w&&pattern.h?pattern.w+' × '+pattern.h+' 格':'远程图纸';
  const badge=remote?'远程素材':(record.price>0?number(record.price)+' 积分':'免费');
  const meta=size+(colors?' <i></i> '+colors+' 色':'')+(beads?' <i></i> '+number(beads)+' 颗':'');
  return '<article class="pattern-card"><a class="art-link" href="'+href+'"'+linkAttrs+' style="--tone:'+esc(pattern.tone||'#e8e3fc')+'">'+preview+(!mine?'<span class="art-badge">'+badge+'</span>':'')+'</a><div class="pattern-info"><div><a class="pattern-title" href="'+href+'"'+linkAttrs+'>'+esc(pattern.title)+'</a><p>'+meta+'</p></div>'+(mine?button('','trash','data-delete="'+esc(id)+'" data-kind="'+kind+'" aria-label="删除 '+esc(pattern.title)+'"','icon-button subtle'):('<div class="card-count" title="点赞">'+icon('heart',15)+' '+number(record.likes||0)+'</div>'))+'</div>'+(mine?'<div class="pattern-foot"><span>'+time(record.updated)+'</span>'+ (isLocal&&!record.cloudId?button('上传云端','cloud','data-upload="'+esc(id)+'"','text-btn'):kind==='cloud'?'<span>'+ (record.public?'已发布':'云端私有')+'</span>':'<span>已关联云端</span>')+'</div>':'')+'</article>';
}
function paintCards(root,locals=[]){
  const map=new Map(locals.map(record=>[record.id,record.pattern]));
  root.querySelectorAll('[data-draft-preview]').forEach(canvas=>paintPreview(canvas,map.get(canvas.dataset.draftPreview)));
}
async function home(){
  const featured=(await api('/library?page=0').catch(()=>({items:[]}))).items.filter(item=>item.source==='remote').slice(0,4);
  const hero=featured[0];
  const heroHref=hero?.url||'/share';
  main.innerHTML='<div class="wrap home"><section class="hero" id="drop-zone"><div class="hero-copy"><h1>把每一个喜欢，<br><em>拼成像素。</em></h1><p>从一张图，到一颗颗有色号的豆。<br>生成图纸、自由编辑，最后把它拼出来。</p><div class="hero-actions">'+button('开始创作','plus','data-new','btn primary hero-primary')+locationLink('/share','逛图纸库','library','btn hero-secondary')+'</div><p class="drop-label">'+icon('upload',14)+' 也可以直接拖入图片</p></div><a href="'+esc(heroHref)+'" class="hero-art" aria-label="打开远程图纸"'+(hero?' target="_blank" rel="noopener noreferrer"':'')+'><div class="back-plate"></div><div class="art-board"><div class="board-line"><span class="board-pins"><i></i><i></i><i></i></span><span>远程图纸</span></div>'+(hero?'<img id="hero-remote" src="'+esc(hero.preview)+'" alt="'+esc(hero.title)+'">':'<span class="feature-icon blue">'+icon('library',42)+'</span>')+'<div class="board-info"><div class="board-palette"></div><span>'+(hero?esc(hero.title):'图纸库')+'</span></div></div><div class="bead-note"><span>'+icon('spark',17)+'</span><div><b>'+(hero?esc(hero.title):'远程图纸库')+'</b><small>打开远程图纸</small></div>'+icon('arrow',16)+'</div></a></section>'+
    '<section class="home-create">'+sectionHead('开始一张图纸','选择你的创作方式')+'<div class="creation-grid">'+entry.map(([id,label,desc,glyph,color])=>'<button type="button" class="creation-card" data-create="'+id+'"><span class="feature-icon '+color+'">'+icon(glyph,24)+'</span><span class="creation-name">'+label+'</span><span class="creation-description">'+desc+'</span><span class="creation-arrow">'+icon('arrow',17)+'</span></button>').join('')+'</div></section>'+
    '<section id="home-recent" class="home-gallery" hidden></section><section class="home-gallery">'+sectionHead('远程图纸','从你的素材库挑一张开始',locationLink('/share','查看全部图纸','chevron','text-btn'))+'<div class="pattern-grid">'+featured.map(item=>patternCard(item,'remote')).join('')+'</div></section></div>';
  paintCards(main);installCreation(main);
  const drop=$('#drop-zone');
  drop.ondragover=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();drop.classList.add('dragging');}};
  drop.ondragleave=e=>{if(!drop.contains(e.relatedTarget))drop.classList.remove('dragging');};
  drop.ondrop=e=>{if(e.dataTransfer.files.length){e.preventDefault();drop.classList.remove('dragging');imageStart(e.dataTransfer.files[0]);}};
  const recent=$('#home-recent'), items=await localIndex().catch(()=>[]);
  if(!recent.isConnected||!items.length)return;
  recent.hidden=false;
  recent.innerHTML=sectionHead('继续创作','',locationLink('/projects','查看我的作品','chevron','text-btn'))+'<div class="pattern-grid">'+items.slice(0,4).map(record=>patternCard(record,'local')).join('')+'</div>';
  paintCards(recent,items);installProjects(recent,items);
}

function installProjects(root,items=[]){
  root.querySelectorAll('[data-upload]').forEach(node=>node.onclick=()=>{
    const state=items.find(item=>item.id===node.dataset.upload);
    const launch=()=>{
      if(!ensureUser(launch)||!checkCreate(launch))return;
      busy(node,async()=>{await storeCloud(state);toast('已上传云端');await render();});
    };
    launch();
  });
  root.querySelectorAll('[data-delete]').forEach(node=>node.onclick=()=>{
    const cloud=node.dataset.kind==='cloud',id=node.dataset.delete;
    const dlg=modal('删除图纸','<p class="dialog-copy">确认删除这张'+(cloud?'云端':'本地')+'图纸？'+(cloud?'如果已经发布，图纸库中的页面也会移除。':'')+'</p><form><button class="btn danger" type="submit">确认删除</button></form>');
    formAction($('form',dlg),async()=>{
      if(cloud){
        await api('/projects/'+id,'DELETE');
        const linked=(await localIndex().catch(()=>[])).filter(record=>record.cloudId===id);
        await Promise.all(linked.map(record=>drafts('put',{...record,cloudId:undefined})));
      }else await drafts('delete',id);
      if(activeDraft && (cloud?activeDraft.cloudId===id:activeDraft.id===id))activeDraft=null;
      closeModal();toast('图纸已删除');await render();
    });
  });
}
async function projects(gen){
  main.innerHTML='<div class="wrap inner"><div id="project-frame">'+pageHead('','我的作品','在本地起稿，把需要同步的图纸存到云端。')+'<div class="loading">正在读取项目…</div></div></div>';
  const [locals,cloud]=await Promise.allSettled([localIndex(),user?api('/projects').then(r=>r.items):Promise.resolve([])]);
  if(gen!==routing)return;
  const local=locals.status==='fulfilled'?locals.value:[], online=cloud.status==='fulfilled'?cloud.value:[];
  const current=projectTab==='local'?local:online;
  const node=$('#project-frame');
  node.innerHTML=pageHead('','我的作品',local.length+' 个本地草稿 · '+online.length+' 个云端项目','<div class="head-buttons">'+button('导入图纸','upload','id="import-file"')+button('新建图纸','plus','data-new','btn primary')+'</div>')+
    '<div class="tabs line-tabs">'+button('本地草稿 <span>'+local.length+'</span>','folder','data-tab="local"','tab '+(projectTab==='local'?'active':''))+button('云端项目 <span>'+online.length+'</span>','cloud','data-tab="cloud"','tab '+(projectTab==='cloud'?'active':''))+'</div>'+
    ((projectTab==='cloud'?cloud:locals).status==='rejected'?empty('help','项目读取失败',(projectTab==='cloud'?cloud:locals).reason.message,button('重试',null,'id="retry-projects"')):current.length?'<div class="pattern-grid project-grid">'+current.map(item=>patternCard(item,projectTab)).join('')+'</div>':projectTab==='cloud'&&!user?empty('cloud','登录后查看云端项目','云端图纸可在其他设备继续编辑。',button('登录 / 注册','user','id="projects-login"','btn primary')):empty('folder',projectTab==='local'?'还没有本地草稿':'还没有云端作品',projectTab==='local'?'创建第一张图纸后，改动会自动保存到此浏览器。':'在工作台点击存到云端，图纸就会出现在这里。',button('新建图纸','plus','data-new','btn primary')));
  node.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{projectTab=x.dataset.tab;render();});
  $('#projects-login')?.addEventListener('click',()=>auth());
  $('#retry-projects')?.addEventListener('click',()=>render());
  $('#import-file').onclick=()=>{
    const dlg=modal('导入图纸文件','<p class="dialog-copy muted">选择从豆格工坊导出的 .json 图纸文件。</p><form class="form-stack"><input type="file" name="file" accept=".json,application/json" aria-label="图纸文件" required><button type="submit" class="btn primary">'+icon('upload',16)+' 打开图纸</button></form>');
    formAction($('form',dlg),async form=>{
      const file=form.elements.file.files[0];
      if(file.size>2000000)throw Error('图纸文件过大');
      let pattern;
      try {pattern=validateImported(JSON.parse(await file.text()));}catch(error){throw Error(error instanceof SyntaxError?'文件不是有效的 JSON 图纸':error.message);}
      await start(pattern);
    });
  };
  paintCards(node,local);installCreation(node);installProjects(node,local);
}
async function studio(gen, query){
  main.innerHTML='<div class="wrap loading">正在准备画板…</div>';
  const {draft,cloud}=Object.fromEntries(query);
  if(session.requireMembership&&!user?.member){
    main.innerHTML='<div class="wrap inner">'+empty('card','激活创作卡密','激活后可以生成和编辑图纸。',button('激活卡密','card','id="studio-redeem"','btn primary'))+'</div>';
    $('#studio-redeem').onclick=()=>redeem(render);
    return;
  }
  let record;
  if(draft){
    record=activeDraft?.id===draft?activeDraft:await drafts('get',draft);
    if(!record)throw Error('找不到这个本地草稿');
    await restoreSource(record);
  }else if(cloud){
    if(!user){
      main.innerHTML='<div class="wrap inner">'+empty('cloud','登录后打开云端作品','请使用保存此图纸时的账号。',button('登录 / 注册','user','id="open-login"','btn primary'))+'</div>';
      $('#open-login').onclick=()=>auth('login',render);
      return;
    }
    const [remote,items]=await Promise.all([api('/projects/'+cloud),localIndex().catch(()=>[])]);
    if(remote.project.owner!==user.id||!remote.pattern)throw Error('这个图纸无法在你的工作台直接编辑');
    const linked=items.find(d=>d.cloudId===cloud);
    if(linked) await restoreSource(linked);
    record={...linked,id:linked?.id||draftId(),cloudId:cloud,pattern:linked?.updated>remote.project.updated?linked.pattern:remote.pattern};
  }else{
    if(gen!==routing)return;
    main.innerHTML='<div class="wrap inner">'+empty('board','选择一种创作方式','图片、文字、二维码或从空白开始。',button('新建图纸','plus','data-new','btn primary'))+'</div>';
    installCreation(main);return;
  }
  if(gen!==routing)return;
  activeDraft=record;
  cleanup=mountStudio(main,record,{palettes,saveLocal,saveCloud,publish,ensureUser});
}

async function libraryPage(gen){
  const current=library;
  main.innerHTML='<div class="wrap inner"><section class="library-banner">'+pageHead('','图纸库','寻找下一张想拼的图纸。')+'<form id="search-library" class="search-box">'+icon('search',20)+'<input name="q" aria-label="搜索图纸或作者" placeholder="搜索图纸或作者" maxlength="60" value="'+esc(current.q)+'"><button class="btn primary" type="submit">搜索</button></form></section><div class="library-controls"><div class="tabs line-tabs" aria-label="浏览方式">'+[['recommended','推荐'],['newest','全部'],['popular','排行榜'],['favorites','我的收藏']].map(([id,label])=>button(label,id==='favorites'?'star':id==='popular'?'award':null,'data-mode="'+id+'"','tab '+((current.mode||current.sort)===id?'active':''))).join('')+'</div><div class="chips" aria-label="按题材浏览">'+['',...categories].map(c=>button(esc(c||'全部题材'),null,'data-category="'+esc(c)+'" aria-pressed="'+(current.category===c)+'"','chip')).join('')+'</div></div><div id="library-results" class="loading" aria-live="polite">正在加载图纸…</div></div>';
  formAction($('#search-library'),form=>setLibrary({q:textOf(form,'q')}));
  main.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{
    if(x.dataset.mode==='favorites'&&!ensureUser(()=>setLibrary({mode:'favorites'})))return;
    setLibrary(x.dataset.mode==='favorites'?{mode:'favorites'}:{mode:'',sort:x.dataset.mode});
  });
  main.querySelectorAll('[data-category]').forEach(x=>x.onclick=()=>setLibrary({category:x.dataset.category}));
  await showLibrary(gen);
}
function setLibrary(changes){ library={...library,...changes,page:0}; return render(); }
async function showLibrary(gen,append=false){
  const query=new URLSearchParams(library);
  const result=await api('/library?'+query);
  if(gen!==routing)return;
  const target=$('#library-results');
  target.classList.remove('loading');
  if(!append)target.innerHTML=result.items.length?'<div class="pattern-grid"></div>':empty('search','没有匹配的图纸','换个关键词或选择其他题材。',button('清除筛选',null,'id="clear-filter"'));
  if(result.items.length)$('.pattern-grid',target).insertAdjacentHTML('beforeend',result.items.map(item=>patternCard(item,item.source==='remote'?'remote':undefined)).join(''));
  $('#clear-filter',target)?.addEventListener('click',()=>setLibrary({category:'',q:'',mode:'',sort:'recommended'}));
  $('#load-library',target)?.remove();
  if(result.more){
    target.insertAdjacentHTML('beforeend',button('加载更多',null,'id="load-library"','btn load-more'));
    $('#load-library',target).onclick=e=>busy(e.currentTarget,async()=>{library.page++;try{await showLibrary(gen,true);}catch(error){library.page--;throw error;}});
  }
}
async function detail(gen,id){
  main.innerHTML='<div class="wrap loading">正在打开图纸…</div>';
  const remote=id.startsWith('remote-');
  const [{project,pattern},commentsResult]=await Promise.all([remote?api('/remote-library/'+id):api('/projects/'+id),remote?Promise.resolve({items:[]}):api('/projects/'+id+'/comments')]);
  const comments=commentsResult.items;
  if(gen!==routing)return;
  const viewerOwns=Boolean(user&&project.owner===user.id);
  const preview=remote?'<img src="'+esc(project.preview)+'" alt="'+esc(project.title)+' 图案">':pattern?'<canvas aria-label="'+esc(project.title)+' 图案"></canvas>':'<img src="/api/projects/'+encodeURIComponent(id)+'/preview" alt="'+esc(project.title)+' 图案">';
  const stats=remote?'<div><dt>用色</dt><dd>'+number(project.colors)+' 色</dd></div><div><dt>预览</dt><dd>'+number(project.views)+'</dd></div><div><dt>收藏</dt><dd>'+number(project.saves)+'</dd></div>':'<div><dt>用色</dt><dd>'+number(project.colors)+' 色</dd></div><div><dt>预览</dt><dd>'+number(project.views)+'</dd></div><div><dt>收藏</dt><dd>'+number(project.saves)+'</dd></div>';
  main.innerHTML='<div class="wrap inner"><a href="/share" class="text-btn back-link">'+icon('back',17)+' 图纸库</a><div class="detail-layout"><div class="detail-art" style="--tone:'+esc(project.tone||'#e8e3fc')+'">'+preview+'</div><section class="detail-info"><span class="chip neutral">'+esc(project.category)+'</span><h1>'+esc(project.title)+'</h1><p class="muted">by '+esc(project.author)+'</p><p class="detail-desc">'+esc(project.description||'这是一张拼豆图纸。')+'</p><dl class="detail-spec">'+stats+'</dl><div class="detail-actions">'+
    (viewerOwns?locationLink('/studio?cloud='+id,'编辑图纸','brush','btn primary'):project.public?button(project.price&&!pattern?'用 '+number(project.price)+' 积分获取':'保存并编辑','folder','id="use-pattern"','btn primary'):'')+
    (remote?button('导入编辑器','image','id="remote-import"','btn primary')+('<a class="btn" href="'+esc(project.url)+'" target="_blank" rel="noopener noreferrer">打开原图</a>'):pattern?button('导出图纸','download','id="detail-export"'):'')+
    '</div>'+(project.public?'<div class="detail-reactions">'+button('点赞 <span id="like-number">'+number(project.likes)+'</span>','heart','data-react="like" aria-pressed="'+project.reacts.includes('like')+'"','btn reaction')+button('收藏','star','data-react="favorite" aria-pressed="'+project.reacts.includes('favorite')+'"','btn reaction')+'<span>'+icon('eye',16)+' '+number(project.views)+' 次预览</span><span>'+number(project.saves)+' 次保存</span></div>':'')+'</section></div>'+(remote?'':'<section class="detail-comments">'+sectionHead('图纸留言')+(project.public?'<form id="comment-form" class="form-stack"><label class="sr-only" for="comment-text">留言内容</label><textarea id="comment-text" name="text" maxlength="300" rows="2" placeholder="分享你的制作心得…" required></textarea><button type="submit" class="btn primary">发表留言</button></form>':'')+'<div class="comment-list">'+(comments.length?comments.map(c=>'<article><span class="avatar mini">'+esc([...c.name][0])+'</span><div><b>'+esc(c.name)+'</b><span class="muted">'+time(c.created)+'</span><p>'+esc(c.body)+'</p></div></article>').join(''):'<p class="muted">暂时没有留言。</p>')+'</div></section>')+'</div>';
  if(pattern)paintPreview($('.detail-art canvas'),pattern,{beads:true});
  if(project.public&&!history.state?.viewed){
    history.replaceState({viewed:true},'');
    api('/projects/'+id+'/view','POST',{}).catch(()=>{});
  }
  $('#detail-export')?.addEventListener('click',()=>{ if(checkCreate(()=>exportDialog(pattern)))exportDialog(pattern); });
  $('#remote-import')?.addEventListener('click',e=>busy(e.currentTarget,async()=>{
    const response=await fetch(project.preview);
    if(!response.ok)throw Error('远程图纸暂时无法读取');
    const file=new File([await response.blob()],project.title+'.webp',{type:'image/webp'});
    await imageStart(file);
  }));
  $('#use-pattern')?.addEventListener('click',e=>{
    const node=e.currentTarget;
    const launch=()=>{
      if(!checkCreate(launch))return;
      if(!user&&pattern){start({...pattern,title:project.title}).catch(error=>toast(error.message,'error'));return;}
      if(!ensureUser(launch))return;
      return busy(node,async()=>{
        const save=async()=>{
          const copy=await api('/projects/'+id+'/import','POST',{});
          user.points=copy.points;closeModal();toast('图纸已保存到云端');
          await navigate('/studio?cloud='+copy.id);
        };
        if(project.price&&!pattern){
          const dlg=modal('使用积分获取图纸','<p class="dialog-copy">获取「'+esc(project.title)+'」需要 '+number(project.price)+' 积分。当前余额 '+number(user.points)+' 积分。</p><form><button type="submit" class="btn primary">确认获取</button></form>');
          formAction($('form',dlg),save);
        }else await save();
      });
    };
    launch();
  });
  main.querySelectorAll('[data-react]').forEach(node=>node.onclick=()=>{
    const react=()=>busy(node,async()=>{
      const result=await api('/projects/'+id+'/react','POST',{kind:node.dataset.react});
      node.setAttribute('aria-pressed',String(result.active));
      $('#like-number').textContent=number(result.likes);
      if(node.dataset.react==='favorite')toast(result.active?'已收藏图纸':'已取消收藏');
    });
    if(ensureUser(react))react();
  });
  const comment=$('#comment-form');
  if(comment)formAction(comment,async form=>{
    const text=textOf(form,'text');
    const send=async()=>{await api('/projects/'+id+'/comments','POST',{text});toast('留言已发表');await render();};
    if(ensureUser(send))await send();
  });
}
init();
