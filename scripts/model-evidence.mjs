// Capture genuine local inference through the application; never store auth tokens.
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const base=process.env.API_BASE_URL??'http://127.0.0.1:8088/api';
let token='';
async function request(path,body){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(65000)});
  const result=await response.json();
  if(!response.ok)throw new Error(`${path}: ${response.status} ${result.message}`);
  return result;
}
const auth=await request('/auth/demo',{});token=auth.token;
const status=await request('/model/status');if(status.status!=='ready')throw new Error('Local model is not ready');
const basic=await request('/model/test',{});
if(basic.mode!=='local_slm'||!basic.response.toLowerCase().includes('function')||!/(scope|lexical|outer)/i.test(basic.response))throw new Error('Basic model evidence did not pass the closure concept check');
console.log(`Actual ${basic.model.model_id} basic response verified (${basic.latency_ms} ms).`);
const grounded=await request('/knowledge/query',{query:'What are JavaScript closures?',use_model:true});
if(grounded.mode!=='local_slm'||!grounded.questions.some(q=>q.id==='closures'))throw new Error('Grounded local inference/citation check failed');
const sourceOnly=await request('/knowledge/query',{query:'What are JavaScript closures?'});
if(sourceOnly.mode!=='demo')throw new Error('Default source-only behavior changed');
const missing=await request('/knowledge/query',{query:'Explain photosynthesis chloroplasts in orchids',use_model:true});
if(missing.mode!=='demo'||missing.questions.length||missing.answer!=='Not found in the interview knowledge base')throw new Error('Missing-source guard failed');
const fallbackCode=`import json; from app.main import query; from app.models import QueryRequest; r=query(QueryRequest(query='What are JavaScript closures?',use_model=True)); print(json.dumps({'mode':r.mode,'warning':r.warning,'cited_source_id':r.questions[0].source.id,'answer_preserved':r.answer==r.questions[0].answer,'trace': [x.model_dump() for x in r.trace]}))`;
const actualFallbacks=[];
for(const environment of [['SLM_ENABLED=false'],['SLM_ENABLED=true','LOCAL_SLM_URL=http://127.0.0.1:9/v1']]){
  const args=['compose','exec','-T',...environment.flatMap(value=>['-e',value]),'agent','/app/agent/.venv/bin/python','-c',fallbackCode];
  const output=execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000});
  const result=JSON.parse(output.trim());if(result.mode!=='demo'||!result.answer_preserved||!result.warning)throw new Error('Actual model unavailable fallback failed');
  actualFallbacks.push({configuration:environment,output:result});
}
const result={recorded_at:new Date().toISOString(),runtime:'Private llama.cpp CPU container; no hosted API or Ollama',weights:{model:'Llama-3.2-3B-Instruct',quantization:'Q4_K_M',sha256:'6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff'},status,basic_test:basic,grounded_query:{request:{query:'What are JavaScript closures?',use_model:true},response:grounded},source_only_mode:sourceOnly.mode,missing_source:missing,actual_unavailable_fallbacks:actualFallbacks};
await mkdir(new URL('../docs/evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('../docs/evidence/local-slm.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({basic_inference:'passed',grounded_query:'passed',source_only_mode:sourceOnly.mode,missing_source:'passed',actual_unavailable_fallbacks:actualFallbacks.length,evidence:'docs/evidence/local-slm.json'},null,2));
