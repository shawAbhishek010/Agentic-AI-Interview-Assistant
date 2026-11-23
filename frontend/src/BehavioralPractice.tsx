import {useEffect,useRef,useState} from 'react';
import {Send} from 'lucide-react';
import {api,errorMessage,post} from './api';
import {Badge,Button,ErrorBox,Panel,Spinner} from './components';

const STAR=['situation','task','action','result'] as const;
type BehavioralQuestion={
  id:string;
  question:string;
  answer:Record<(typeof STAR)[number],string>;
  why_it_works:string;
};
type CoachReply={mode:'local_slm'|'demo';text:string;warning?:string};
type Exchange={message:string;reply:CoachReply};

export function BehavioralPractice(){
  const [questions,setQuestions]=useState<BehavioralQuestion[]>([]);
  const [selected,setSelected]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);

  useEffect(()=>{
    let active=true;
    setLoading(true);
    setError('');
    api<{questions:BehavioralQuestion[]}>('/behavioral/questions')
      .then(result=>{if(active)setQuestions(result.questions)})
      .catch(error=>{if(active)setError(errorMessage(error))})
      .finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[attempt]);

  const question=questions.find(item=>item.id===selected)??questions[0];
  return <div className="practice-studio-grid">
    <Panel title="Behavioral questions">
      {loading?<div className="inline-loading"><Spinner/>Loading sample answers…</div>:null}
      {error?<ErrorBox message={error} retry={()=>setAttempt(previous=>previous+1)}/>:null}
      {question?<>
        <label className="field">Practice question
          <select value={question.id} onChange={event=>setSelected(event.target.value)}>
            {questions.map(item=><option key={item.id} value={item.id}>{item.question}</option>)}
          </select>
        </label>
        <div className="behavioral-answer">
          <h3>Sample STAR answer</h3>
          <p className="small-text muted">Use this fictional example as a guide for telling your own story.</p>
          <dl>{STAR.map(part=><div key={part}>
            <dt>{part}</dt><dd>{question.answer[part]}</dd>
          </div>)}</dl>
          <h3>Why this works</h3>
          <p>{question.why_it_works}</p>
        </div>
      </>:null}
    </Panel>
    {question?<BehavioralCoach key={question.id} questionId={question.id}/>:null}
  </div>;
}

function BehavioralCoach({questionId}:{questionId:string}){
  const [exchanges,setExchanges]=useState<Exchange[]>([]);
  const [draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const log=useRef<HTMLDivElement>(null);
  const mounted=useRef(false);

  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false};
  },[]);
  useEffect(()=>{
    if(log.current)log.current.scrollTop=log.current.scrollHeight;
  },[exchanges.length]);

  async function ask(message:string){
    const text=message.trim();
    if(!text||busy)return;
    setBusy(true);
    setError('');
    try {
      const history=exchanges.slice(-3).flatMap(exchange=>[
        {role:'user',content:exchange.message},
        {role:'assistant',content:exchange.reply.text},
      ]);
      const reply=await post<CoachReply>('/behavioral/chat',{question_id:questionId,message:text,history},45000);
      if(mounted.current){
        setExchanges(previous=>[...previous,{message:text,reply}]);
        setDraft(current=>current===message?'':current);
      }
    } catch(error) {
      if(mounted.current)setError(errorMessage(error));
    } finally {
      if(mounted.current)setBusy(false);
    }
  }

  return <Panel title="Behavioral coach" className="behavioral-coach">
    <p className="conversation-intro">Get another example or paste a draft based on your own experience for feedback.</p>
    {!exchanges.length?<Button variant="secondary" disabled={busy} onClick={()=>void ask('Give me another sample answer using a different scenario.')}>Show another example</Button>:null}
    <div ref={log} className="conversation-messages" role="log" aria-label="Behavioral coaching conversation">
      {exchanges.map(({message,reply},index)=><div className="behavioral-exchange" key={index}>
        <article className="conversation-message user"><strong>You</strong><p>{message}</p></article>
        <article className="conversation-message assistant">
          <strong>Behavioral coach</strong>
          <p>{reply.text}</p>
          <Badge tone="subtle">{reply.mode==='local_slm'?'Local Llama':'Built-in example'}</Badge>
          {reply.warning?<span className="small-text muted">{reply.warning}</span>:null}
        </article>
      </div>)}
    </div>
    <form onSubmit={event=>{event.preventDefault();void ask(draft)}}>
      <label className="field">Ask the behavioral coach
        <textarea value={draft} onChange={event=>setDraft(event.target.value)} rows={4} maxLength={1200}
          placeholder="How could I make the result in my answer more specific?" disabled={busy}/>
      </label>
      <Button type="submit" disabled={!draft.trim()} busy={busy}>Send <Send size={15}/></Button>
    </form>
    {busy?<p className="small-text muted" role="status">Preparing a reply…</p>:null}
    {error?<ErrorBox message={error}/>:null}
  </Panel>;
}
