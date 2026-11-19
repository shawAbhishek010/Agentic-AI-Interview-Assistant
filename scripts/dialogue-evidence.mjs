import {mkdir,writeFile} from 'node:fs/promises';

const base='http://127.0.0.1:8088/api';
let token='';
async function call(path,body){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(65000)});
  const result=await response.json();
  if(!response.ok)throw new Error(`${path}: ${response.status} ${result.message}`);
  return result;
}
token=(await call('/auth/demo',{})).token;
const session=await call('/interviews',{role:'Frontend Developer'});
const question=session.questions[0];
const answered=await call(`/interviews/${session.id}/answers`,{question_id:question.id,answer:question.answer.slice(0,1100)});
const turn=answered.turns[0];
const followUp=await call(`/interviews/${session.id}/chat`,{question_id:question.id,message:'Can you clarify the follow-up you just asked and connect it to my answer?'});
const saved=await call(`/interviews/${session.id}`);
if(followUp.reply.mode!=='local_slm')throw new Error('Actual dialogue evidence requires a generated local-model reply.');
if(saved.questions.length!==5||saved.turns.length!==1||saved.chat_messages.length!==2)throw new Error('Follow-up discussion changed scored interview turns.');
const speech=await fetch(base+'/voice/speech',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({text:followUp.reply.content}),signal:AbortSignal.timeout(30000)});
const audio=Buffer.from(await speech.arrayBuffer());
if(speech.status!==200||audio.toString('ascii',0,4)!=='RIFF')throw new Error('The displayed reply did not produce real local WAV speech.');
const evidence={recorded_at:new Date().toISOString(),scripted_candidate_answer:true,question:question.question,candidate_answer:turn.answer,asked_follow_up:turn.evaluation.follow_up,follow_up_reply:followUp.reply,interview_questions:saved.questions.length,scored_turns:saved.turns.length,chat_messages:saved.chat_messages.length,audio:{status:speech.status,content_type:speech.headers.get('content-type'),bytes:audio.length,wav_header:audio.toString('ascii',0,4)},physical_microphone_verified:false};
await mkdir(new URL('../docs/evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('../docs/evidence/interview-dialogue.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({mode:followUp.reply.mode,scored_turns:saved.turns.length,chat_messages:saved.chat_messages.length,audio_bytes:audio.length,evidence:'docs/evidence/interview-dialogue.json'},null,2));
