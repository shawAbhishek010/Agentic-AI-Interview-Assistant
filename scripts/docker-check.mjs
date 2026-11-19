import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const base='http://127.0.0.1:8088/api';let token='';
async function request(path,method='GET',body){
  const form=body instanceof FormData;
  const res=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{})});
  const result=res.status===204?null:await res.json();if(!res.ok)throw new Error(`${method} ${path}: ${res.status} ${result?.message}`);return result;
}
async function waitReady(){for(let i=0;i<40;i++){try{const health=await request('/health');if(health.status==='ok')return}catch{}await new Promise(r=>setTimeout(r,1000))}throw new Error('Docker API did not become ready')}
await waitReady();
const auth=await request('/auth/demo','POST',{});token=auth.token;const userToken=token;
const session=await request('/interviews','POST',{role:'React Developer'});
await request(`/interviews/${session.id}/answers`,'POST',{question_id:session.questions[0].id,answer:session.questions[0].answer.slice(0,12000)});
console.log('PostgreSQL session created; restarting API to verify persistence.');
execFileSync('docker',['compose','restart','api'],{stdio:'pipe',windowsHide:true});await waitReady();
const restored=await request(`/interviews/${session.id}`);
if(restored.turns.length!==1)throw new Error('Answer did not survive API restart');
const envText=await readFile(new URL('../.env',import.meta.url),'utf8');const env=Object.fromEntries(envText.split(/\r?\n/).filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));
if(!env.ADMIN_EMAIL||!env.ADMIN_PASSWORD)throw new Error('Configure ADMIN_EMAIL and ADMIN_PASSWORD to test source administration');
const admin=await request('/auth/login','POST',{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD});token=admin.token;
const records=Array.from({length:5},(_,i)=>({question:`What does an atomic test transaction guarantee in scenario ${i+1}?`,answer:'An atomic test transaction either commits the complete unit of work or rolls it back.',role:'Import Test Engineer',topic:'Test transactions',concepts:['atomic','commits','rolls back']}));
const form=new FormData();form.set('file',new Blob([JSON.stringify(records)],{type:'application/json'}),'test-bank.json');form.set('title','Temporary integration test bank');form.set('url','https://example.org/placement-ai-test-fixture');form.set('license','MIT');
const imported=await request('/admin/sources/import','POST',form);
try{
  const indexed=await request(`/admin/sources/${imported.id}/index`,'POST');if(indexed.question_count!==5)throw new Error('Import count mismatch');
  const plan=await request('/interviews','POST',{role:'Import Test Engineer'});if(plan.questions.length!==5)throw new Error('Imported role failed exact-five contract');
  token=userToken;
  const denied=await fetch(base+'/admin/sources',{headers:{Authorization:`Bearer ${token}`}});if(denied.status!==403)throw new Error('Ordinary user accessed source administration');
}finally{token=admin.token;await request(`/admin/sources/${imported.id}`,'DELETE')}
const sources=await request('/sources');if(sources.some(s=>s.id===imported.id))throw new Error('Source deletion did not persist');
const result={recorded_at:new Date().toISOString(),runtime:'Docker Compose / PostgreSQL 17',api_restart_persistence:'passed',admin_import_reindex_delete:'passed',imported_role_exact_five:'passed',ordinary_user_admin_access:403,remaining_sources:sources.length,model_mode:'demo; no paid chat calls'};
await writeFile(new URL('../docs/evidence/docker-check.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
