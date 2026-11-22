import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Bot,Mic,MicOff,Send,Volume2} from 'lucide-react';
import {api,errorMessage} from './api';
import type {ChatMessage,Question,Session} from './types';
import type {VoiceController} from './voice';
import {Badge,Button,Citation,ErrorBox,Modal,ModeNote,Panel} from './components';

export function isTutoringRequest(text:string){
  const words=text.toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
  const opening=words.replace(/^(?:(?:um+|uh+|hmm+|well|so|sorry|okay|by the way|quick question)[,:\s]+)+/,'');
  if(/\b(?:can|could|may) i ask\b|^i have (?:a )?question\b/.test(opening))return true;
  if(/\b(?:can|could|would) you\s+(?:please\s+)?(?:help|explain|show|clarify|give|tell|repeat|rephrase)\b|\bhelp me (?:with|understand)\b|\bi (?:don'?t|do not) understand\b/.test(opening))return true;
  if(/^(?:please\s+)?(?:explain|clarify|repeat|rephrase|tell me|give (?:me )?an? example|another example|one more example)\b/.test(opening))return true;
  const uncertainty=/^(?:(?:i\s+)?(?:don'?t|do not)\s+(?:know|no|understand|get it)|i(?:'m| am|m)\s+(?:not sure|confused|stuck)|not sure|(?:i have )?no (?:idea|clue))\b/;
  const question=opening.replace(uncertainty,'').replace(/^[\s,.!?]*(?:but\s+)?/,'').replace(/^(what|who|where|how)'?s\b/,'$1 is');
  if(!/^(?:what happens|how (?:it|this) works|what (?:this|it) means)\s+is\b/.test(question)){
    if(/^(?:(?:what|how|why|when|where|which|who)\s+(?:is|are|was|were|do|does|did|can|could|should|would|will|have|has)|what (?:happens|if|about)|how come)\b/.test(question))return true;
    if(/^(?:what|how|why|when|where|which|who|is|are|does|can|should)\b.*\?$/.test(question))return true;
  }
  if(/^(?:can|could|would|should|may|do|does|did|is|are|am|will|has|have)\s+(?:i|you|we|it|that|there)\b/.test(question))return true;
  if(!uncertainty.test(opening))return false;
  return !/\b(?:but|i think|i guess|maybe)\b/.test(opening.replace(uncertainty,''));
}
export interface ConversationHandle {ask:(text:string)=>void;stop:()=>void;draft:(text:string)=>void}
interface Props {session:Session;question:Question|undefined;onUpdate:(s:Session)=>void;voice:VoiceController;spoken:boolean;setSpoken:(enabled:boolean)=>void;disabled:boolean;onBusy:(busy:boolean)=>void;onReply:(text:string)=>boolean;onVoiceStart:()=>void;onFailure:()=>void}
export const InterviewConversation=forwardRef<ConversationHandle,Props>(function InterviewConversation({session,question,onUpdate,voice,spoken,setSpoken,disabled,onBusy,onReply,onVoiceStart,onFailure},ref){
  const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false),[handsFree,setHandsFree]=useState(false);
  const ongoing=useRef(false),request=useRef<AbortController|null>(null),sequence=useRef(0),listenAgain=useRef<()=>void>(()=>{}),sendLatest=useRef<(text:string)=>void>(()=>{}),busyRef=useRef(false);
  const conversationLog=useRef<HTMLDivElement>(null);
  const messages=(session.chat_messages??[]).filter(m=>m.question_id===question?.id);
  useEffect(()=>{const log=conversationLog.current;if(log)log.scrollTop=log.scrollHeight},[messages.length]);
  const stop=()=>{ongoing.current=false;setHandsFree(false);voice.stop();request.current?.abort();sequence.current++;busyRef.current=false;setBusy(false);onBusy(false)};
  useEffect(()=>{setDraft('');setError('');return()=>{ongoing.current=false;request.current?.abort();sequence.current++;voice.stop();onBusy(false)}},[session.id,question?.id]);
  useEffect(()=>{if(disabled&&(ongoing.current||busyRef.current))stop()},[disabled]);
  const listen=()=>{
    if(!ongoing.current||disabled||busyRef.current)return;
    voice.listen({onTranscript:setDraft,onComplete:text=>sendLatest.current(text),onError:()=>{ongoing.current=false;setHandsFree(false)}});
  };
  listenAgain.current=listen;
  const ask=async(text:string)=>{
    if(!question||!text.trim()||busyRef.current||disabled)return;
    voice.stop();setDraft(text.trim());setError('');setBusy(true);busyRef.current=true;onBusy(true);const id=++sequence.current;const controller=new AbortController();request.current=controller;
    try{
      const response=await api<{messages:ChatMessage[];reply:ChatMessage}>(`/interviews/${session.id}/chat`,{method:'POST',body:JSON.stringify({message:text.trim(),question_id:question.id}),signal:controller.signal},65000);
      if(sequence.current!==id)return;
      onUpdate({...session,chat_messages:response.messages});setDraft('');setBusy(false);busyRef.current=false;onBusy(false);
      if(!onReply(response.reply.content)&&(spoken||ongoing.current))voice.speak(response.reply.content,{onEnd:()=>listenAgain.current(),onError:()=>{ongoing.current=false;setHandsFree(false)}});
    }catch(e){if(controller.signal.aborted)return;setError(errorMessage(e));ongoing.current=false;setHandsFree(false);onFailure()}
    finally{if(sequence.current===id){setBusy(false);busyRef.current=false;onBusy(false)}}
  };
  sendLatest.current=text=>void ask(text);
  useImperativeHandle(ref,()=>({ask:text=>{conversationLog.current?.scrollIntoView({behavior:'smooth',block:'center'});void ask(text)},stop,draft:setDraft}));
  const begin=()=>{onVoiceStart();setConsent(false);setSpoken(true);ongoing.current=true;setHandsFree(true);listenAgain.current()};
  const replay=(text:string)=>{if(!onReply(text))voice.speak(text,{onEnd:()=>listenAgain.current(),onError:()=>{ongoing.current=false;setHandsFree(false)}})};
  return <Panel title="Ask Ava" className="conversation-panel" action={<Badge tone="cyan">Not graded</Badge>}><p className="conversation-intro">Ask about the interview question or take a detour. You can return to this question when you’re ready.</p>
    <div ref={conversationLog} className="conversation-messages" role="log" aria-label="Conversation with Ava" aria-live="polite">
      {messages.length?messages.map(m=><article className={`conversation-message ${m.role}`} key={m.id}>
        <strong>{m.role==='user'?'You':'Ava'}</strong>
        <p>{m.content}</p>
        {m.role==='assistant'?<>
          {m.scope==='general'?<span className="small-text muted">General conversation</span>:null}
          {m.scope!=='unavailable'?<ModeNote mode={m.mode} model={m.model}/>:null}
          {m.source&&(!m.scope||m.scope==='interview')?<Citation source={m.source}/>:null}
          {m.warning?<span className="small-text muted">{m.warning}</span>:null}
          <button className="text-button" aria-label="Play Ava reply" onClick={()=>replay(m.content)} disabled={disabled}><Volume2 size={14}/>Listen to reply</button>
        </>:null}
      </article>):<div className="conversation-empty"><Bot size={22}/><span>“I don’t understand this. Can you explain it with an example?”</span></div>}
    </div>
    {question&&messages.at(-1)?.scope==='unavailable'?<details className="source-preview">
      <summary>Read the current interview reference</summary>
      <p>{question.answer}</p>
      <Citation source={question.source}/>
    </details>:null}
    <form onSubmit={e=>{e.preventDefault();void ask(draft)}}><label className="sr-only" htmlFor="ava-question">Ask Ava about this question</label><textarea id="ava-question" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} placeholder="Ask Ava to help you understand…" disabled={disabled||busy}/><div className="conversation-actions"><Button type="button" variant={handsFree?'danger':'secondary'} disabled={disabled||busy&&!handsFree} onClick={()=>{if(handsFree)stop();else if(!voice.supported)voice.listen();else setConsent(true)}}>{handsFree?<MicOff size={16}/>:<Mic size={16}/>} {handsFree?'Stop voice conversation':'Ask with voice'}</Button><Button type="submit" busy={busy} disabled={disabled||!draft.trim()}>Ask Ava <Send size={15}/></Button></div></form>
    {handsFree?<p className="voice-state" role="status">{busy?'Ava is thinking…':voice.speaking?'Ava is speaking. Listening resumes after the reply.':voice.preparing?'Preparing a spoken reply…':voice.listening?'Listening for your cross-question. Pause when you finish speaking.':'Voice conversation is active.'}</p>:null}{error?<ErrorBox message={error}/>:null}
    {consent?<Modal title="Talk through this question with Ava" onClose={()=>setConsent(false)}><p>Your browser will transcribe your questions and send the text to your private interview conversation. Ava replies using the local model and speaks the reply aloud.</p><p className="muted">Your browser may use its vendor’s speech recognition service. Placement AI stores conversation text, not microphone audio. The microphone resumes after each reply until you stop or pause the conversation.</p><div className="modal-actions"><Button variant="secondary" onClick={()=>setConsent(false)}>Keep typing</Button><Button onClick={begin}>Allow & start voice conversation</Button></div></Modal>:null}
  </Panel>
});
