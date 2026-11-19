import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:8088/api';let token='';
async function call(path,body){const form=body instanceof FormData;const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(65000)});const json=await r.json();if(!r.ok)throw new Error(`${path}: ${r.status} ${json.message}`);return json}
for(let i=0;i<60;i++){try{const h=await call('/health');if(h.agent_status==='ok'&&h.model?.status==='ready')break}catch{}if(i===59)throw new Error('Application did not become ready');await new Promise(r=>setTimeout(r,1000))}
token=(await call('/auth/demo',{})).token;
const session=await call('/interviews',{role:'Frontend Developer'});const q=session.questions.find(q=>q.id==='accessibility-aria')??session.questions[0];
const teaching=await call(`/interviews/${session.id}/chat`,{question_id:q.id,message:"I don't understand ARIA. Can you help me understand that in simple terms?"});
const cross=await call(`/interviews/${session.id}/chat`,{question_id:q.id,message:'Can you give me an example of that from the reference?'});
if(teaching.reply.mode!=='local_slm'||cross.reply.mode!=='local_slm')throw new Error('The live tutoring check used fallback; inference evidence requires real generated replies.');
const saved=await call(`/interviews/${session.id}`);
if(saved.turns.length||saved.questions.length!==5||saved.chat_messages.length!==4)throw new Error('Tutoring must not score or advance the five-question interview');
console.log(JSON.stringify({tutoring_mode:teaching.reply.mode,cross_question_mode:cross.reply.mode,teaching:teaching.reply.content,cross_question:cross.reply.content}));
const voiceResponse=await fetch(base+'/voice/speech',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({text:teaching.reply.content.slice(0,1200)})});const audio=Buffer.from(await voiceResponse.arrayBuffer());
if(voiceResponse.status!==200||audio.toString('ascii',0,4)!=='RIFF')throw new Error('Real local Piper audio is unavailable');
const text='Database transactions have ACID properties. Atomicity means all changes commit together or roll back together. Consistency preserves database rules. Isolation separates concurrent transactions. Durability means committed changes survive a restart.';
const form=new FormData();form.set('file',new Blob([text],{type:'text/plain'}),'transaction-lesson.txt');form.set('title','Synthetic verification lesson');
const document=await call('/documents/import',form);
const notes=await call(`/documents/${document.id}/generate`,{kind:'notes',request:'Explain atomicity in simple language with key points.',count:3});
const questions=await call(`/documents/${document.id}/generate`,{kind:'questions',request:'Create two short questions about atomicity and durability.',count:2});
if(questions.questions?.length!==2||!notes.summary||!notes.sources?.length)throw new Error('Requested study material contract failed');
if(notes.mode!=='local_slm'||questions.mode!=='local_slm')throw new Error('The live generation check used fallback; retry after local inference is ready.');
const originalToken=token;token=(await call('/auth/demo',{})).token;const denied=await fetch(base+`/documents/${document.id}`,{headers:{Authorization:`Bearer ${token}`}});if(denied.status!==404)throw new Error('Document ownership boundary failed');token=originalToken;
const result={recorded_at:new Date().toISOString(),synthetic_document:true,tutoring:teaching.reply,cross_question:cross.reply,interview_questions:saved.questions.length,scored_turns:saved.turns.length,saved_chat_messages:saved.chat_messages.length,piper:{status:voiceResponse.status,content_type:voiceResponse.headers.get('content-type'),audio_bytes:audio.length,wav_header:audio.toString('ascii',0,4)},study_document:document,notes,questions,cross_account_document_access:denied.status};
await mkdir(new URL('../docs/evidence/',import.meta.url),{recursive:true});await writeFile(new URL('../docs/evidence/learning-assistant.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({scored_turns:saved.turns.length,saved_chat_messages:saved.chat_messages.length,piper_audio_bytes:audio.length,notes_mode:notes.mode,questions_mode:questions.mode,questions:questions.questions.length,document_isolation:denied.status,evidence:'docs/evidence/learning-assistant.json'},null,2));
