import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { categories } from './public/categories.js';
import { createRemoteLibrary, remoteImageOrigin, remoteImageUrl } from './remote-library.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(root, 'public');
const dbFile = process.env.DB_FILE || resolve(root, 'data/studio.sqlite');
if (dbFile !== ':memory:') await mkdir(dirname(resolve(dbFile)), {recursive:true});
const getRemoteLibrary=createRemoteLibrary(dbFile===':memory:'?null:resolve(dirname(resolve(dbFile)),'remote-library.json'));
const db = new DatabaseSync(dbFile);
db.exec("" +
  "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;" +
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, account TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', member INTEGER NOT NULL DEFAULT 0, points INTEGER NOT NULL DEFAULT 20);" +
  "CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner TEXT REFERENCES users(id), body TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT '其他', description TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL DEFAULT 0, public INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, saves INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS reactions (project TEXT REFERENCES projects(id) ON DELETE CASCADE, user TEXT REFERENCES users(id) ON DELETE CASCADE, kind TEXT, PRIMARY KEY(project,user,kind));" +
  "CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, project TEXT REFERENCES projects(id) ON DELETE CASCADE, user TEXT REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY, user TEXT REFERENCES users(id), amount INTEGER NOT NULL, note TEXT NOT NULL, created INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS stock (user TEXT REFERENCES users(id), brand TEXT NOT NULL, code TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0), PRIMARY KEY(user,brand,code));" +
  "CREATE TABLE IF NOT EXISTS stock_log (id INTEGER PRIMARY KEY, user TEXT REFERENCES users(id), brand TEXT NOT NULL, code TEXT NOT NULL, amount INTEGER NOT NULL, created INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS cards (hash TEXT PRIMARY KEY, issuer TEXT REFERENCES users(id), duration INTEGER NOT NULL, used TEXT REFERENCES users(id), created INTEGER NOT NULL);" +
  "CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, user TEXT REFERENCES users(id), contact TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created INTEGER NOT NULL);" +
  "CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner,updated DESC); CREATE INDEX IF NOT EXISTS projects_public ON projects(public,updated DESC);"
);
const get = (sql,...args) => db.prepare(sql).get(...args);
const all = (sql,...args) => db.prepare(sql).all(...args);
const run = (sql,...args) => db.prepare(sql).run(...args);
const now = Date.now;
const day = 86400000;
const requireMembership = process.env.REQUIRE_MEMBERSHIP !== '0';
const adminAccount = (process.env.ADMIN_ACCOUNT || '').trim().toLowerCase();
const adminSecret = process.env.ADMIN_BOOTSTRAP_SECRET || '';
const defaultTone = '#e8e3fc';
const brands = ['MARD','COCO','ManMan','PanPan','MiXiaoWo','自定义'];
const paletteSource = JSON.parse(await readFile(resolve(publicDir,'palettes.json'),'utf8'));
const stockCodes = new Map(Object.entries(paletteSource).map(([brand,colors])=>[brand,new Set(colors.map(c=>c[0]))]));
const hash = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(24).toString('base64url');
const cardCode = () => randomBytes(12).toString('hex').toUpperCase().match(/.{6}/g).join('-');
const procScrypt = promisify(scrypt);
const sortOptions = Object.freeze({newest:'p.updated DESC', popular:'likes DESC, p.saves DESC, p.views DESC', recommended:'p.featured DESC, p.updated DESC'});

run('DELETE FROM projects WHERE owner IS NULL');

function reject(status,message) { throw Object.assign(new Error(message),{status}); }
function requireUser(user) { if(!user) reject(401,'请先登录'); }
function requireAdmin(user) { requireUser(user); if(user.role!=='admin') reject(403,'需要管理员权限'); }
function member(user) { return Boolean(user && (user.role==='admin'||user.member>now())); }
function requireCreator(user) { if(requireMembership&&!member(user)) reject(403,'请先激活创作卡密'); }
function string(value,max) { return typeof value==='string' ? value.trim().slice(0,max) : ''; }
function validateText(value,max,message) {
  if(typeof value!=='string'||!value.trim()||value.trim().length>max) reject(400,message);
  return value.trim();
}
function integer(value,min,max,message) {
  if(!Number.isInteger(value)||value<min||value>max) reject(400,message);
  return value;
}
function accountKey(input) {
  const account=string(input,32).toLowerCase();
  if(!/^[a-z0-9_-]{2,32}$/.test(account)) reject(400,'用户名需为 2–32 位字母、数字、下划线或短横线');
  return account;
}
function passwordInput(value) {
  if(typeof value!=='string'||value.length<8||value.length>64) reject(400,'密码需为 8–64 个字符');
  return value;
}
async function passwordHash(password,salt=randomBytes(18).toString('hex')) {
  const derived=await procScrypt(password,salt,64);
  return salt+'.'+derived.toString('hex');
}
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result=fn(); db.exec('COMMIT'); return result; }
  catch(error) { db.exec('ROLLBACK'); throw error; }
}
function userInfo(user) {
  return user && {id:user.id, account:user.account, name:user.name, role:user.role, points:user.points, member:member(user), expires:user.member};
}
const due = new Map();
function rate(req, group, limit, interval) {
  const cutoff=now();
  if(due.size>2000) for(const [key,value] of due) if(value.until<=cutoff) due.delete(key);
  if(due.size>=10000) reject(429,'请求过多，请稍后再试');
  const key=group+'|'+req.socket.remoteAddress;
  const record=due.get(key);
  if(!record||record.until<=cutoff) due.set(key,{count:1,until:cutoff+interval});
  else if(++record.count>limit) reject(429,'请求过多，请稍后再试');
}
function balances(user, amount, note) {
  if(!run('UPDATE users SET points=points+? WHERE id=? AND points+?>=0',amount,user,amount).changes) reject(409,'积分余额不足');
  run('INSERT INTO ledger(user,amount,note,created) VALUES(?,?,?,?)',user,amount,note,now());
}
function adjustStock(user,brand,code,delta) {
  const next=(get('SELECT amount FROM stock WHERE user=? AND brand=? AND code=?',user,brand,code)?.amount||0)+delta;
  if(next<0||next>9999999) reject(409,code+' 库存不足或超出库存上限');
  run('INSERT INTO stock VALUES(?,?,?,?) ON CONFLICT(user,brand,code) DO UPDATE SET amount=excluded.amount',user,brand,code,next);
  run('INSERT INTO stock_log(user,brand,code,amount,created) VALUES(?,?,?,?,?)',user,brand,code,delta,now());
  return next;
}
function cleanPattern(input) {
  if(!input||typeof input!=='object') reject(400,'图纸格式无效');
  const w=integer(input.w,1,250,'图纸宽度需为 1–250 格');
  const h=integer(input.h,1,250,'图纸高度需为 1–250 格');
  const title=validateText(input.title,60,'图纸名称需为 1–60 个字符');
  const brand=brands.includes(input.brand)?input.brand:'自定义';
  if(!Array.isArray(input.palette)||input.palette.length>400) reject(400,'图纸色板无效');
  const codes=new Set();
  const palette=input.palette.map(c=>{
    if(!c||typeof c.code!=='string'||!/^[A-Za-z0-9_-]{1,16}$/.test(c.code)||typeof c.hex!=='string'||!/^#[\da-f]{6}$/i.test(c.hex)||codes.has(c.code)) reject(400,'色号或颜色格式无效');
    codes.add(c.code);
    return {code:c.code,hex:c.hex.toLowerCase()};
  });
  if(!Array.isArray(input.cells)||input.cells.length!==w*h||input.cells.some(c=>c!==null&&!codes.has(c))) reject(400,'图纸网格与色板不匹配');
  const tone=/^#[\da-f]{6}$/i.test(input.tone)?input.tone:defaultTone;
  return {w,h,title,brand,palette,cells:input.cells,tone,source:['image','blank','text','qr'].includes(input.source)?input.source:'blank'};
}
function projectInfo(row, user) {
  const {cells,palette,w,h,tone,brand}=JSON.parse(row.body);
  const reacts=user ? all('SELECT kind FROM reactions WHERE project=? AND user=?',row.id,user.id).map(r=>r.kind) : [];
  return {id:row.id,title:row.title,owner:row.owner,author:row.author||'豆格工坊',w,h,tone,brand,beads:cells.filter(Boolean).length,colors:new Set(cells.filter(Boolean)).size,palette:palette.length,category:row.category,description:row.description,price:row.price,public:!!row.public,featured:!!row.featured,views:row.views,saves:row.saves,likes:row.likes,reacts,updated:row.updated};
}
const canRead=(row,user)=>row.price===0||row.owner===user?.id||user?.role==='admin'||Boolean(user&&get("SELECT 1 FROM reactions WHERE project=? AND user=? AND kind='access'",row.id,user.id));
const projectSelect="SELECT p.*,u.name AS author,(SELECT count(*) FROM reactions WHERE project=p.id AND kind='like') AS likes FROM projects p LEFT JOIN users u ON u.id=p.owner";
function getProject(id,user,own=false) {
  const row=get(projectSelect+' WHERE p.id=?',id);
  if(!row||(own? row.owner!==user?.id : !row.public&&row.owner!==user?.id&&user?.role!=='admin')) reject(404,'找不到这张图纸');
  return row;
}
function sessionCookie(res,token,age,secure) {
  res.setHeader('Set-Cookie','bead_session='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(secure?'; Secure':''));
}
function issueSession(res,user,secure) {
  const token=secret();
  run('DELETE FROM sessions WHERE expires<=?',now());
  run('INSERT INTO sessions VALUES(?,?,?)',hash(token),user,now()+30*day);
  sessionCookie(res,token,2592000,secure);
}
async function jsonBody(req) {
  let length=0;
  const chunks=[];
  for await(const chunk of req) {
    length+=chunk.length;
    if(length>2_000_000) reject(413,'请求内容太大');
    chunks.push(chunk);
  }
  try {
    const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)) return parsed;
  } catch {}
  reject(400,'请求格式无效');
}
function json(res,data,status=200) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function configuredUrl(value) {
  try { const url=new URL(value); return url.protocol==='https:' ? url.href : ''; } catch { return ''; }
}
function createCard(user,duration) {
  const code=cardCode();
  run('INSERT INTO cards(hash,issuer,duration,created) VALUES(?,?,?,?)',hash(code),user,duration,now());
  return code;
}
const cardFormat=/^[A-F0-9]{6}(?:-[A-F0-9]{6}){3}$/;
function claimCard(user,code){
  const card=get('SELECT * FROM cards WHERE hash=? AND used IS NULL',hash(code));
  if(!card)reject(400,'卡密无效或已经使用');
  const current=get('SELECT member FROM users WHERE id=?',user).member;
  const forever=253402214400000;
  const expiry=card.duration===0||current===forever?forever:Math.min(forever,Math.max(now(),current)+card.duration*day);
  run('UPDATE cards SET used=? WHERE hash=?',user,card.hash);
  run('UPDATE users SET member=? WHERE id=?',expiry,user);
  return expiry;
}
function image(res,row,user) {
  let {w,h,palette,cells}=JSON.parse(row.body);
  if(row.price>0&&!canRead(row,user)){
    const original={w,h,cells};
    const scale=Math.min(.55,24/Math.max(w,h));
    w=Math.max(1,Math.floor(w*scale));h=Math.max(1,Math.floor(h*scale));
    cells=Array.from({length:w*h},(_,i)=>original.cells[Math.floor((Math.floor(i/w)+.5)*original.h/h)*original.w+Math.floor((i%w+.5)*original.w/w)]);
  }
  const shapes=new Map(palette.map(c=>[c.code,{hex:c.hex,path:[]}]));
  for(let y=0;y<h;y++) for(let x=0;x<w;){
    const code=cells[y*w+x];
    if(!code){ x++; continue; }
    let width=1;
    while(x+width<w&&cells[y*w+x+width]===code) width++;
    shapes.get(code)?.path.push('M'+x+' '+y+'h'+width+'v1h-'+width+'z');
    x+=width;
  }
  res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'private, no-cache'});
  res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" shape-rendering="crispEdges">'+[...shapes.values()].filter(s=>s.path.length).map(s=>'<path fill="'+s.hex+'" d="'+s.path.join('')+'"/>').join('')+'</svg>');
}

async function api(req,res,url,user,token,secure) {
  const {pathname:path,searchParams:query}=url;
  const method=req.method;
  if(method!=='GET'){
    const origin=req.headers.origin;
    if(req.headers['sec-fetch-site']==='cross-site'||(origin&&origin!==process.env.PUBLIC_ORIGIN&&origin!==(secure?'https://':'http://')+req.headers.host)) reject(403,'请求来源无效');
    if(method!=='DELETE'&&!req.headers['content-type']?.startsWith('application/json')) reject(415,'请发送 JSON 请求');
  }
  const body=()=>jsonBody(req);
  if(method==='GET'&&path==='/api/session') return {user:userInfo(user),requireMembership,shop:configuredUrl(process.env.CARD_SHOP_URL),community:configuredUrl(process.env.COMMUNITY_URL),support:string(process.env.SUPPORT_EMAIL,160)};
  if(method==='GET'&&path==='/api/remote-image'){
    const source=remoteImageUrl(query.get('url'));
    if(!source)reject(400,'远程图片地址无效');
    res.writeHead(307,{'Location':source,'Cache-Control':'public, max-age=300'});
    res.end();
    return;
  }
  if(method==='GET'&&path.startsWith('/api/remote-library/')){
    const id=decodeURIComponent(path.slice('/api/remote-library/'.length));
    const remote=(await getRemoteLibrary()).find(item=>item.id===id);
    if(!remote)reject(404,'找不到远程图纸');
    return {project:{...remote,public:false,reacts:[]},pattern:null};
  }
  if(method==='POST'&&path==='/api/register'){
    rate(req,'auth',24,900000);
    const data=await body(),account=accountKey(data.account),password=passwordInput(data.password);
    const admin=adminAccount===account&&Boolean(adminSecret)&&hash(String(data.adminSecret||''))===hash(adminSecret);
    if(adminAccount===account&&!admin)reject(403,'该账号需要正确的管理员注册密钥');
    const id=randomUUID(),recovery=secret(), encrypted=await passwordHash(password);
    if(get('SELECT 1 FROM users WHERE account=?',account)) reject(409,'该账号已注册');
    transaction(()=>{
      run('INSERT INTO users(id,account,name,password,recovery,role) VALUES(?,?,?,?,?,?)',id,account,validateText(data.name,30,'昵称需为 1–30 个字符'),encrypted,hash(recovery),admin?'admin':'user');
      run('INSERT INTO ledger(user,amount,note,created) VALUES(?,20,?,?)',id,'注册赠送',now());
      if(data.card)claimCard(id,string(data.card,80).toUpperCase());
      issueSession(res,id,secure);
    });
    return {user:userInfo(get('SELECT * FROM users WHERE id=?',id)),recovery};
  }
  if(method==='POST'&&path==='/api/login'){
    rate(req,'auth',24,900000);
    const data=await body(),key=string(data.account,160),password=passwordInput(data.password);
    const entry=cardFormat.test(key.toUpperCase())
      ?get('SELECT u.* FROM cards c JOIN users u ON u.id=c.used WHERE c.hash=?',hash(key.toUpperCase()))
      :get('SELECT * FROM users WHERE account=?',accountKey(key));
    const derived=await passwordHash(password,entry?.password.split('.')[0]||'000000000000000000000000000000000000');
    if(!entry||!timingSafeEqual(Buffer.from(derived),Buffer.from(entry.password))) reject(401,'账号或密码错误');
    issueSession(res,entry.id,secure);
    return {user:userInfo(entry)};
  }
  if(method==='POST'&&path==='/api/card-binding'){
    rate(req,'redeem',30,900000);
    const entry=get('SELECT u.account FROM cards c JOIN users u ON u.id=c.used WHERE c.hash=?',hash(string((await body()).code,80).toUpperCase()));
    if(!entry)reject(404,'未找到已绑定的账号');
    const [name,domain]=entry.account.split('@');
    return {account:domain?name.slice(0,1)+'***@'+domain:name.slice(0,3)+'****'+name.slice(-4)};
  }
  if(method==='POST'&&path==='/api/recover'){
    rate(req,'auth',24,900000);
    const data=await body(), account=accountKey(data.account), recoveryCode=string(data.recovery,64);
    const entry=get('SELECT * FROM users WHERE account=?',account);
    if(!entry)reject(401,'账号或恢复凭证错误');
    if(hash(recoveryCode)!==entry.recovery)reject(401,'账号或恢复凭证错误');
    const recovery=secret(), encrypted=await passwordHash(passwordInput(data.password));
    transaction(()=>{
      if(!run('UPDATE users SET password=?,recovery=? WHERE id=? AND recovery=?',encrypted,hash(recovery),entry.id,entry.recovery).changes) reject(409,'恢复码已使用');
      run('DELETE FROM sessions WHERE user=?',entry.id);
      issueSession(res,entry.id,secure);
    });
    return {user:userInfo(entry),recovery};
  }
  if(method==='POST'&&path==='/api/logout'){
    if(token) run('DELETE FROM sessions WHERE token=?',hash(token));
    sessionCookie(res,'',0,secure);
    return {ok:true};
  }
  if(method==='PATCH'&&path==='/api/profile'){
    requireUser(user);
    const name=validateText((await body()).name,30,'昵称需为 1–30 个字符');
    run('UPDATE users SET name=? WHERE id=?',name,user.id);
    return {user:userInfo({...user,name})};
  }
  if(method==='GET'&&path==='/api/library'){
    const filter=string(query.get('q'),60),category=query.get('category'),sort=query.get('sort');
    const page=Math.max(0,Math.min(2000,Number.parseInt(query.get('page'),10)||0));
    const mode=query.get('mode');
    const where=["p.public=1"],args=[];
    if(filter){ where.push('(instr(lower(p.title),lower(?))>0 OR instr(lower(p.description),lower(?))>0 OR instr(lower(coalesce(u.name,?)),lower(?))>0)'); args.push(filter,filter,'豆格工坊',filter); }
    if(categories.includes(category)){ where.push('p.category=?'); args.push(category); }
    if(mode==='favorites'){ requireUser(user); where.push("EXISTS(SELECT 1 FROM reactions WHERE project=p.id AND user=? AND kind='favorite')"); args.push(user.id); }
    const rows=all(projectSelect+' WHERE '+where.join(' AND ')+' ORDER BY '+(Object.hasOwn(sortOptions,sort)?sortOptions[sort]:sortOptions.recommended)+', p.id LIMIT 13 OFFSET ?',...args,page*12);
    const remote=await getRemoteLibrary();
    const remoteItems=remote.filter(item=>{
      if(categories.includes(category)&&item.category!==category)return false;
      if(filter&&!`${item.title} ${item.description} ${item.category}`.toLowerCase().includes(filter.toLowerCase()))return false;
      return true;
    });
    const localItems=rows.slice(0,12).map(row=>projectInfo(row,user));
    const remotePage=remoteItems.slice(page*12,page*12+12);
    return {items:[...localItems,...remotePage],more:rows.length>12||remoteItems.length>page*12+12,remoteCount:remoteItems.length};
  }
  if(path==='/api/projects'){
    requireUser(user);
    if(method==='GET') return {items:all(projectSelect+' WHERE p.owner=? ORDER BY p.updated DESC',user.id).map(row=>projectInfo(row,user))};
    if(method==='POST'){
      requireCreator(user);
      const pattern=cleanPattern(await body()),id=randomUUID();
      run('INSERT INTO projects(id,owner,body,title,created,updated) VALUES(?,?,?,?,?,?)',id,user.id,JSON.stringify(pattern),pattern.title,now(),now());
      return {id};
    }
  }
  const projectMatch=path.match(/^\/api\/projects\/([\w-]+)(?:\/(preview|public|react|import|comments|view))?$/);
  if(projectMatch){
    const [,id,action]=projectMatch;
    if(method==='GET'){
      const row=getProject(id,user);
      if(action==='preview'){ image(res,row,user); return; }
      if(action==='comments') return {items:all('SELECT c.id,c.body,c.created,u.name,c.user FROM comments c JOIN users u ON u.id=c.user WHERE c.project=? ORDER BY c.created DESC LIMIT 100',id)};
      if(!action) return {project:projectInfo(row,user),pattern:canRead(row,user)?JSON.parse(row.body):null};
    }
    if(method==='POST'&&action==='view'){
      const row=getProject(id,user);
      rate(req,'view',150,60000);
      if(row.public) run('UPDATE projects SET views=views+1 WHERE id=?',id);
      return {ok:true};
    }
    requireUser(user);
    if(method==='PATCH'&&!action){
      requireCreator(user);
      getProject(id,user,true);
      const pattern=cleanPattern(await body());
      run('UPDATE projects SET body=?,title=?,updated=? WHERE id=?',JSON.stringify(pattern),pattern.title,now(),id);
      return {id};
    }
    if(method==='DELETE'&&!action){
      getProject(id,user,true);
      run('DELETE FROM projects WHERE id=?',id);
      return {ok:true};
    }
    if(method==='POST'&&action==='public'){
      requireCreator(user);
      getProject(id,user,true);
      const data=await body();
      if(typeof data.public!=='boolean') reject(400,'请选择是否公开');
      const category=categories.includes(data.category)?data.category:'其他';
      const price=integer(data.price??0,0,9999,'积分需为 0–9999 的整数');
      run('UPDATE projects SET public=?,category=?,description=?,price=?,updated=? WHERE id=?',Number(data.public),category,string(data.description,300),price,now(),id);
      return {ok:true};
    }
    if(method==='POST'&&action==='react'){
      const row=getProject(id,user),kind=(await body()).kind;
      if(!row.public||!['like','favorite'].includes(kind)) reject(400,'该图纸暂不支持互动');
      const active=transaction(()=>{
        if(run('DELETE FROM reactions WHERE project=? AND user=? AND kind=?',id,user.id,kind).changes) return false;
        run('INSERT INTO reactions VALUES(?,?,?)',id,user.id,kind);
        return true;
      });
      return {active,likes:get("SELECT count(*) AS total FROM reactions WHERE project=? AND kind='like'",id).total};
    }
    if(method==='POST'&&action==='import'){
      requireCreator(user);
      const row=getProject(id,user);
      if(!row.public) reject(400,'该图纸目前未发布');
      const copy=transaction(()=>{
        const duplicate=get('SELECT p.id FROM projects p JOIN reactions r ON r.project=p.id WHERE p.owner=? AND r.user=? AND r.kind=?',user.id,user.id,'copy:'+id);
        if(duplicate) return duplicate.id;
        if(row.price>0&&row.owner!==user.id&&!get("SELECT 1 FROM reactions WHERE project=? AND user=? AND kind='access'",id,user.id)){
          balances(user.id,-row.price,'获取图纸 · '+row.title);
          if(row.owner) balances(row.owner,row.price,'图纸收入 · '+row.title);
          run("INSERT INTO reactions VALUES(?,?,'access')",id,user.id);
        }
        const copyId=randomUUID(),pattern=JSON.parse(row.body);
        run('INSERT INTO projects(id,owner,body,title,created,updated) VALUES(?,?,?,?,?,?)',copyId,user.id,JSON.stringify(pattern),row.title,now(),now());
        run('INSERT INTO reactions VALUES(?,?,?)',copyId,user.id,'copy:'+id);
        if(row.owner!==user.id) run('UPDATE projects SET saves=saves+1 WHERE id=?',id);
        return copyId;
      });
      return {id:copy,points:get('SELECT points FROM users WHERE id=?',user.id).points};
    }
    if(method==='POST'&&action==='comments'){
      rate(req,'comment',20,60000);
      const row=getProject(id,user);
      if(!row.public) reject(400,'该图纸目前未发布');
      run('INSERT INTO comments VALUES(?,?,?,?,?)',randomUUID(),id,user.id,validateText((await body()).text,300,'评论需为 1–300 个字符'),now());
      return {ok:true};
    }
  }
  if(method==='GET'&&path==='/api/wallet'){
    requireUser(user);
    return {points:user.points,items:all('SELECT amount,note,created FROM ledger WHERE user=? ORDER BY id DESC LIMIT 100',user.id)};
  }
  if(path==='/api/inventory'){
    requireUser(user);
    if(method==='GET') return {items:all('SELECT brand,code,amount FROM stock WHERE user=? ORDER BY brand,code',user.id),history:all('SELECT brand,code,amount,created FROM stock_log WHERE user=? ORDER BY id DESC LIMIT 50',user.id)};
    if(method==='POST'){
      const data=await body(),entries=data.entries||[data];
      if(!stockCodes.has(data.brand)&&data.brand!=='自定义'||!Array.isArray(entries)||!entries.length||entries.length>400) reject(400,'请选择色板和材料');
      transaction(()=>{
        for(const item of entries){
          if(!item||typeof item.code!=='string'||!/^[\w-]{1,16}$/.test(item.code)||(stockCodes.has(data.brand)&&!stockCodes.get(data.brand).has(item.code))) reject(400,'该色板没有此色号');
          const quantity=integer(item.amount,-62500,9999999,'请输入有效的库存变动量');
          if(!quantity) reject(400,'库存变动量不能为零');
          adjustStock(user.id,data.brand,item.code,quantity);
        }
      });
      return {ok:true};
    }
  }
  if(method==='POST'&&path==='/api/redeem'){
    requireUser(user);
    rate(req,'redeem',30,900000);
    const code=string((await body()).code,80).toUpperCase();
    const expires=transaction(()=>claimCard(user.id,code));
    return {user:userInfo({...user,member:expires})};
  }
  if(method==='POST'&&path==='/api/support'){
    rate(req,'contact',10,900000);
    const data=await body();
    run('INSERT INTO tickets(id,user,contact,subject,body,created) VALUES(?,?,?,?,?,?)',randomUUID(),user?.id||null,validateText(data.contact,120,'请填写联系方式'),validateText(data.subject,90,'请填写反馈主题'),validateText(data.body,1000,'请输入 1–1000 字的内容'),now());
    return {ok:true};
  }
  if(path.startsWith('/api/admin')){
    requireAdmin(user);
    if(method==='GET'&&path==='/api/admin') return {
      tickets:all('SELECT * FROM tickets ORDER BY created DESC LIMIT 100'),
      projects:all(projectSelect+" WHERE p.public=1 AND p.owner IS NOT NULL ORDER BY p.updated DESC LIMIT 100").map(row=>projectInfo(row,user))
    };
    if(method==='POST'&&path==='/api/admin/cards'){
      const data=await body(), duration=integer(data.duration,0,365,'有效天数需为 0–365');
      const count=integer(data.count,1,50,'一次可开 1–50 张卡密');
      return {cards:transaction(()=>Array.from({length:count},()=>createCard(user.id,duration)))};
    }
    if(method==='POST'&&path==='/api/admin/ticket'){
      run("UPDATE tickets SET status='closed' WHERE id=?",string((await body()).id,60));
      return {ok:true};
    }
    if(method==='POST'&&path==='/api/admin/project'){
      const data=await body();
      if(data.featured===true) run('UPDATE projects SET featured=1 WHERE id=? AND public=1',string(data.id,60));
      else run('UPDATE projects SET public=0,featured=0 WHERE id=?',string(data.id,60));
      return {ok:true};
    }
  }
  reject(404,'找不到请求的资源');
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webm':'video/webm','.png':'image/png'};
const vendor=new Map([
  ['/vendor/jsqr.js','node_modules/jsqr/dist/jsQR.js'],
  ['/vendor/qr.mjs','node_modules/qrcode-generator/dist/qrcode.mjs']
]);
const server=createServer(async(req,res)=>{
  try {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${remoteImageOrigin}; connect-src 'self' ${remoteImageOrigin}; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
    const url=new URL(req.url,'http://localhost');
    const path=url.pathname;
    if(path.startsWith('/api/')){
      const token=req.headers.cookie?.match(/(?:^|;\s*)bead_session=([\w-]+)(?:;|$)/)?.[1];
      const user=token?get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>?',hash(token),now()):null;
      const secure=req.socket.encrypted||process.env.PUBLIC_ORIGIN?.startsWith('https://');
      const result=await api(req,res,url,user||null,token,secure);
      if(!res.writableEnded) json(res,result);
      return;
    }
    if(!['GET','HEAD'].includes(req.method)) reject(405,'请求方式无效');
    const shell=/^\/(?:$|projects\/?$|studio\/?$|share(?:\/[\w-]+)?\/?$|me\/?$|admin\/?$|help\/?$|gywm\.html$|lxwm\.html$)/.test(path);
    const file=shell?resolve(publicDir,'index.html'):vendor.has(path)?resolve(root,vendor.get(path)):resolve(publicDir,'.'+decodeURIComponent(path));
    if(!vendor.has(path)&&!file.startsWith(publicDir+'/')&&!file.startsWith(publicDir+'\\')) reject(404,'找不到页面');
    const type=types[extname(file)];
    if(!type) reject(404,'找不到页面');
    const bytes=await readFile(file).catch(error=>{if(error.code==='ENOENT'||error.code==='EISDIR') reject(404,'找不到页面'); throw error;});
    res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length,'Cache-Control':shell?'no-cache':'public, max-age=300'});
    res.end(req.method==='HEAD'?undefined:bytes);
  } catch(error) {
    if(res.headersSent){ res.end(); return; }
    if(!error.status) console.error(error);
    json(res,{error:error.status?error.message:'服务器处理失败，请重试'},error.status||500);
  }
});
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>{
  console.log('豆格工坊已启动 http://'+(process.env.HOST||'127.0.0.1')+':'+server.address().port);
});
