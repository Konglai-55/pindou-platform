import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createPattern, flood, clearBorder, reduceColors, tally, paletteSubset } from './public/engine.js';

const palette=[{code:'A1',hex:'#ffffff'},{code:'A2',hex:'#fefefe'},{code:'B1',hex:'#161616'}];
const pattern=createPattern(3,3,palette,{title:'原创测试图纸',cells:['A1','A1','A1','A1','B1','A1','A2','A1','A1']});

test('边缘去背景、填充、颜色数量和品牌色卡', async()=>{
  const next=structuredClone(pattern);
  assert.equal(clearBorder(next),8);
  assert.deepEqual(tally(next).map(c=>[c.code,c.count]),[['B1',1]]);
  flood(next.cells,3,3,0,'A1');
  assert.equal(tally(next)[0].count,8);
  assert.equal(tally(reduceColors(pattern,0,1)).length,1);
  const palettes=JSON.parse(await readFile(new URL('./public/palettes.json',import.meta.url)));
  assert.equal(paletteSubset(palettes.MARD,221).length,221);
  for(const colors of Object.values(palettes)){
    assert.equal(paletteSubset(colors,24).length,24);
    assert.equal(new Set(colors.map(color=>color[0])).size,colors.length);
  }
});

async function start(t,env={}){
  const child=spawn(process.execPath,['server.mjs'],{
    cwd:new URL('.',import.meta.url),
    env:{...process.env,PORT:'0',HOST:'127.0.0.1',DB_FILE:':memory:',REQUIRE_MEMBERSHIP:'0',PUBLIC_ORIGIN:'',ADMIN_ACCOUNT:'admin',ADMIN_BOOTSTRAP_SECRET:'test-bootstrap-only',...env},
    stdio:['ignore','pipe','pipe']
  });
  let diagnostics='';
  child.stderr.on('data',chunk=>{diagnostics+=chunk;});
  const exited=once(child,'exit');
  t.after(async()=>{child.kill();await exited;});
  const url=await new Promise((resolve,reject)=>{
    child.stdout.on('data',data=>{
      const match=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if(match)resolve(match[0]);
    });
    child.once('error',reject);
    child.once('exit',code=>reject(Error('Test server exited with '+code+' '+diagnostics)));
  });
  return url;
}
function client(base){
  const jar=new Map();
  const call=async(path,method='GET',payload,expected=200)=>{
    const cookie=[...jar.values()].filter(entry=>('/api'+path).startsWith(entry.scope)).map(entry=>entry.pair).join('; ');
    const response=await fetch(base+'/api'+path,{method,headers:{...(cookie?{cookie}:{}),...(payload===undefined?{}:{'Content-Type':'application/json'})},body:payload===undefined?undefined:JSON.stringify(payload)});
    for(const header of response.headers.getSetCookie()){
      const pair=header.split(';')[0],name=pair.split('=')[0];
      if(header.includes('Max-Age=0'))jar.delete(name);
      else jar.set(name,{pair,scope:header.match(/Path=([^;]+)/)?.[1]||'/'});
    }
    const data=await response.json();
    assert.equal(response.status,expected,method+' '+path+' '+JSON.stringify(data));
    return data;
  };
  return call;
}
const password='test-only-password';
const register=(call,name,extras={})=>call('/register','POST',{account:name,name,password,...extras});
test('账号、付费图纸、材料库存、管理员发卡和卡密激活', {timeout:20000}, async t=>{
  const url=await start(t);
  const author=client(url), reader=client(url), admin=client(url), guest=client(url);
  assert.equal((await guest('/library')).items.length,0);
  await guest('/register','POST',{account:'admin',name:'admin',password},403);
  const adminRecord=await register(admin,'admin',{adminSecret:'test-bootstrap-only'});
  assert.equal(adminRecord.user.role,'admin');
  const owner=await register(author,'owner');
  const readerAccount=await register(reader,'reader');
  const {id}=await author('/projects','POST',pattern);
  await reader('/projects/'+id,'GET',undefined,404);
  await reader('/projects/'+id,'PATCH',pattern,404);
  await author('/projects/'+id,'PATCH',{...pattern,w:7},400);
  await author('/projects/'+id+'/public','POST',{public:true,category:'动物',description:'验收介绍',price:7});
  const results=await guest('/library?q='+encodeURIComponent('原创测试')+'&category='+encodeURIComponent('动物'));
  assert.deepEqual(results.items.map(p=>p.id),[id]);
  assert.equal((await guest('/projects/'+id)).pattern,null);
  const preview=await fetch(url+'/api/projects/'+id+'/preview');
  assert.match(await preview.text(),/viewBox="0 0 1 1"/);
  const saved=await reader('/projects/'+id+'/import','POST',{});
  const again=await reader('/projects/'+id+'/import','POST',{});
  assert.equal(saved.id,again.id);
  assert.equal(saved.points,13);
  assert.equal((await author('/wallet')).points,27);
  assert.deepEqual((await reader('/projects/'+id)).pattern.cells,pattern.cells);
  const liked=await reader('/projects/'+id+'/react','POST',{kind:'like'});
  assert.deepEqual(liked,{active:true,likes:1});
  await reader('/projects/'+id+'/react','POST',{kind:'favorite'});
  assert.equal((await reader('/library?mode=favorites')).items[0].id,id);
  await reader('/projects/'+id+'/comments','POST',{text:'制作顺利'});
  assert.equal((await guest('/projects/'+id+'/comments')).items[0].body,'制作顺利');

  await author('/inventory','POST',{brand:'MARD',code:'A1',amount:10});
  await author('/inventory','POST',{brand:'MARD',entries:[{code:'A1',amount:-5},{code:'A2',amount:-1}]},409);
  assert.equal((await author('/inventory')).items[0].amount,10);
  await author('/inventory','POST',{brand:'MARD',code:'A1',amount:-3});
  assert.equal((await author('/inventory')).items[0].amount,7);
  assert.deepEqual((await reader('/inventory')).items,[]);

  for(const path of ['/agent','/agent-login','/dailisq.html']) assert.equal((await fetch(url+path)).status,404);
  await guest('/agent','GET',undefined,404);
  await admin('/admin/order','POST',{},404);
  await guest('/alipay/notify','POST',{},404);
  await reader('/admin/cards','POST',{duration:0,count:1},403);
  const {cards}=await admin('/admin/cards','POST',{duration:0,count:1});
  assert.equal((await author('/redeem','POST',{code:cards[0]})).user.member,true);
  await author('/redeem','POST',{code:cards[0]},400);
  assert.equal((await guest('/card-binding','POST',{code:cards[0]})).account,'own****wner');
  await author('/logout','POST',{});
  assert.equal((await author('/login','POST',{account:cards[0],password})).user.id,owner.user.id);

  await guest('/support','POST',{contact:'hello@example.com',subject:'图纸反馈',body:'一条测试反馈'});
  assert.equal((await admin('/admin')).tickets[0].subject,'图纸反馈');
  const next=await reader('/recover','POST',{account:'reader',recovery:readerAccount.recovery,password:'new-test-password'});
  assert.ok(next.recovery&&next.recovery!==readerAccount.recovery);
  await guest('/recover','POST',{account:'reader',recovery:readerAccount.recovery,password},401);
});

test('开启卡密后未激活账号不能创建图纸', {timeout:20000}, async t=>{
  const url=await start(t,{REQUIRE_MEMBERSHIP:'1'});
  const admin=client(url), author=client(url);
  const pattern=createPattern(2,2,palette,{title:'卡密门槛测试',cells:['A1','A1','A1','A1']});
  await register(admin,'admin',{adminSecret:'test-bootstrap-only'});
  await register(author,'author');
  await author('/projects','POST',pattern,403);
  const {cards}=await admin('/admin/cards','POST',{duration:7,count:1});
  await author('/redeem','POST',{code:cards[0]});
  assert.ok((await author('/projects','POST',pattern)).id);
});
