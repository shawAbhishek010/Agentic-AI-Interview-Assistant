// Execute against the real running gateway; never persist authentication tokens.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=process.env.API_BASE_URL??'http://127.0.0.1:8080/api';
let token='';
async function request(path,method='GET',body){
  const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=response.status===204?null:await response.json();
  if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${result?.message}`);
  return result;
}
const auth=await request('/auth/demo','POST',{});token=auth.token;
const catalog=await request('/catalog');
const examples=[];
for(const role of ['Backend Developer','React Developer','Frontend Developer']){
  const session=await request('/interviews','POST',{role});
  if(session.questions.length!==5||new Set(session.questions.map(q=>q.id)).size!==5)throw new Error('Exact-five contract failed');
  if(!session.questions.every(q=>q.answer&&q.follow_up&&q.source.url&&q.source.license))throw new Error('Citation or follow-up is missing');
  examples.push({request:{method:'POST',path:'/api/interviews',body:{role}},status:201,response:session});
}
const first=examples[0].response;
let completed=first;
for(const q of first.questions)completed=await request(`/interviews/${first.id}/answers`,'POST',{question_id:q.id,answer:q.answer.slice(0,12000)});
completed=await request(`/interviews/${first.id}/finish`,'POST',{});
if(completed.status!=='completed'||completed.turns.length!==5)throw new Error('Completion/persistence contract failed');
const overview=await request('/analytics/overview');
if(overview.interviews_completed!==1||overview.questions_practiced!==5)throw new Error('Analytics do not match saved activity');
const fallback=await request('/knowledge/query','POST',{query:'Explain photosynthesis chloroplasts in orchids'});
if(fallback.questions.length||fallback.answer!=='Not found in the interview knowledge base')throw new Error('Missing-source fallback failed');
const secondAuth=await request('/auth/demo','POST',{});const firstToken=token;token=secondAuth.token;
const denied=await fetch(`${base}/interviews/${first.id}`,{headers:{Authorization:`Bearer ${token}`}});
if(denied.status!==404)throw new Error('Cross-account isolation failed');
token=firstToken;
const evidence={recorded_at:new Date().toISOString(),environment:process.env.SMOKE_ENVIRONMENT??'live local gateway → FastAPI agent; H2 development persistence',catalog,examples,completed_interview:completed,analytics:overview,missing_source:{request:{query:'Explain photosynthesis chloroplasts in orchids'},response:fallback},cross_account_access_status:denied.status};
const evidenceDir=fileURLToPath(new URL('../docs/evidence/',import.meta.url));await mkdir(evidenceDir,{recursive:true});
const evidenceFile=process.env.SMOKE_EVIDENCE_FILE??'actual-api-results.json';
if(!/^[a-z-]+\.json$/.test(evidenceFile))throw new Error('Invalid evidence filename');
await writeFile(evidenceDir+evidenceFile,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({roles_checked:examples.map(x=>x.request.body.role),five_question_contract:'passed',completed_answers:completed.turns.length,analytics:'passed',missing_source:'passed',cross_account_access:denied.status,evidence:'docs/evidence/'+evidenceFile},null,2));
