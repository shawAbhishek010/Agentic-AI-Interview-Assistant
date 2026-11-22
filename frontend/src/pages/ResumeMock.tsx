import {useEffect,useRef,useState} from 'react';
import {ArrowRight,FileText,Trash2,Upload,Volume2,VolumeX} from 'lucide-react';
import {api,errorMessage,post} from '../api';
import {Avatar,Badge,Button,ErrorBox,formatDate,PageHeading,Panel,Spinner} from '../components';
import {useVoice} from '../voice';

type ResumeSummary={
  id:string; file_name:string; target_role:string; created_at:string;
  mode:'local_slm'|'extractive'; answered_count:number;
};
type ResumeQuestion={id:string; question:string; reference_answer:string; follow_up:string; source:{locator:string;excerpt:string}};
type ResumeTurn={question_id:string;answer:string;follow_up_answer:string;answered_at:string};
type Mock=ResumeSummary & {questions:ResumeQuestion[];turns:ResumeTurn[]};

export function ResumeMock({roles}:{roles:string[]}){
  const [history,setHistory]=useState<ResumeSummary[]>([]);
  const [current,setCurrent]=useState<Mock|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [targetRole,setTargetRole]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [started,setStarted]=useState(false);
  const [followUpVisible,setFollowUpVisible]=useState(false);
  const [answer,setAnswer]=useState('');
  const [followUpAnswer,setFollowUpAnswer]=useState('');
  const [spoken,setSpoken]=useState(true);
  const voice=useVoice(()=>{});
  const fileInput=useRef<HTMLInputElement>(null);
  const mounted=useRef(true);

  useEffect(()=>{
    mounted.current=true;
    let active=true;
    api<ResumeSummary[]>('/resume-mocks').then(result=>{if(active)setHistory(result)})
      .catch(error=>{if(active)setError(errorMessage(error))}).finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false;mounted.current=false};
  },[]);

  function select(mock:Mock|null){
    voice.stop();
    voice.clearError();
    setCurrent(mock);
    setStarted(false);
    setFollowUpVisible(false);
    setAnswer('');
    setFollowUpAnswer('');
  }

  async function upload(){
    if(!file||targetRole.trim().length<2||busy)return;
    setError('');
    if(file.size>5_000_000){setError('Maximum resume size is 5 MB.');return}
    voice.stop();
    setBusy(true);
    try {
      const form=new FormData();
      form.set('file',file);
      form.set('target_role',targetRole.trim());
      const mock=await api<Mock>('/resume-mocks',{method:'POST',body:form},55000);
      setHistory(previous=>[mock,...previous]);
      select(mock);
      setFile(null);
      if(fileInput.current)fileInput.current.value='';
    } catch(error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function open(id:string){
    if(busy)return;
    voice.stop();
    setBusy(true);
    setError('');
    try {select(await api<Mock>('/resume-mocks/'+id))}
    catch(error){setError(errorMessage(error))}
    finally{setBusy(false)}
  }

  async function remove(mock:ResumeSummary){
    if(busy||!window.confirm('Delete this saved resume mock and its answers?'))return;
    if(current?.id===mock.id)voice.stop();
    setBusy(true);
    setError('');
    try {
      await api('/resume-mocks/'+mock.id,{method:'DELETE'});
      setHistory(previous=>previous.filter(item=>item.id!==mock.id));
      if(current?.id===mock.id)select(null);
    } catch(error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const question=current?.questions[current.turns.length];
  const completed=!!current&&!question;
  const narrate=(text:string)=>{if(mounted.current&&spoken)voice.speak(text)};

  async function save(){
    if(!current||!question||busy||!answer.trim())return;
    setBusy(true);
    setError('');
    voice.stop();
    try {
      const next=await post<Mock>('/resume-mocks/'+current.id+'/answers',{
        question_id:question.id,answer:answer.trim(),follow_up_answer:followUpAnswer.trim(),
      });
      setCurrent(next);
      setHistory(previous=>previous.map(item=>item.id===next.id?next:item));
      setAnswer('');
      setFollowUpAnswer('');
      setFollowUpVisible(false);
      const nextQuestion=next.questions[next.turns.length];
      if(nextQuestion)narrate(nextQuestion.question);
    } catch(error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <PageHeading title="Resume Mock" description="Practice five interview questions grounded in your resume and target role."/>
    {error?<ErrorBox message={error}/>:null}
    <div className="resume-layout">
      <div className="resume-sidebar">
        <Panel title="New resume mock">
          <form onSubmit={event=>{event.preventDefault();void upload()}}>
            <label className="field">Upload resume
              <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md" required disabled={busy} onChange={event=>setFile(event.target.files?.[0]??null)}/>
            </label>
            <label className="field">Target job
              <input value={targetRole} list="resume-target-roles" placeholder="e.g. Backend Developer" required maxLength={100} minLength={2} disabled={busy} onChange={event=>setTargetRole(event.target.value)}/>
            </label>
            <datalist id="resume-target-roles">{roles.map(role=><option key={role} value={role}/>)}</datalist>
            <p className="small-text muted">PDF, DOCX, TXT, or Markdown up to 5 MB. The original file is discarded after extraction. Saved excerpts and answers are private to your account.</p>
            <Button type="submit" disabled={!file||targetRole.trim().length<2} busy={busy}><Upload size={16}/>Prepare resume mock</Button>
          </form>
        </Panel>
        <Panel title="Saved mocks">
          {loading?<Spinner/>:history.length?<div className="resume-history">{history.map(mock=><div key={mock.id} className={current?.id===mock.id?'selected':''}>
            <button className="resume-history-title" disabled={busy} onClick={()=>void open(mock.id)}>
              <FileText size={16}/><span><strong>{mock.target_role}</strong><small>{formatDate(mock.created_at,true)} · {mock.answered_count} / 5 answered</small></span>
            </button>
            <button className="icon-button" aria-label={'Delete resume mock for '+mock.target_role} disabled={busy} onClick={()=>void remove(mock)}><Trash2 size={16}/></button>
          </div>)}</div>:<p className="muted">Your saved mocks appear here.</p>}
        </Panel>
      </div>

      <div className="resume-main">
        <Panel className="resume-ava">
          <Avatar speaking={voice.speaking}/>
          <div><h2>AVA · Resume interviewer</h2><p>{current?current.target_role:'Upload your resume to preview the questions and supporting passages.'}</p></div>
          {current&&started&&!completed?<button className="text-button" aria-pressed={spoken} onClick={()=>{
            if(spoken)voice.stop();
            else if(question)voice.speak(followUpVisible?question.follow_up:question.question);
            setSpoken(!spoken);
          }}>{spoken?<Volume2 size={16}/>:<VolumeX size={16}/>}Spoken replies {spoken?'on':'off'}</button>:null}
        </Panel>
        {current?<>
          {voice.error?<ErrorBox message={voice.error}/>:null}
          {!started&&!completed?<Panel title="Question preview" action={<Badge tone="subtle">{current.mode==='local_slm'?'Local Llama':'Extractive RAG'}</Badge>}>
            <p className="muted">Every question below cites a distinct resume excerpt. This mock is ungraded.</p>
            <ol className="resume-previews">{current.questions.map(item=><li key={item.id}>
              <strong>{item.question}</strong><details><summary>{item.source.locator}</summary><p>{item.source.excerpt}</p></details>
            </li>)}</ol>
            <Button disabled={busy} onClick={()=>{setStarted(true);if(question)narrate(question.question)}}>{current.turns.length?'Resume mock interview':'Start resume interview'} <ArrowRight size={16}/></Button>
          </Panel>:null}
          {started&&question?<Panel title={'Question '+(current.turns.length+1)+' of '+current.questions.length}
            action={<button className="text-button" aria-label="Read resume question aloud" disabled={busy} onClick={()=>voice.speak(followUpVisible?question.follow_up:question.question)}><Volume2 size={16}/>Read aloud</button>}>
            <h3>{question.question}</h3>
            <details className="resume-evidence"><summary>Resume evidence · {question.source.locator}</summary><p>{question.source.excerpt}</p></details>
            <label className="field">Your resume answer<textarea value={answer} onChange={event=>setAnswer(event.target.value)} maxLength={12000} rows={5} disabled={busy}/></label>
            {followUpVisible?<div className="follow-up-preview">
              <h3>Follow-up</h3><p>{question.follow_up}</p>
              <label className="field">Follow-up answer (optional)<textarea value={followUpAnswer} onChange={event=>setFollowUpAnswer(event.target.value)} maxLength={4000} rows={3} disabled={busy}/></label>
              <Button disabled={!answer.trim()} busy={busy} onClick={()=>void save()}>{current.turns.length===4?'Finish resume mock':'Save and continue'} <ArrowRight size={16}/></Button>
            </div>:<Button disabled={!answer.trim()||busy} onClick={()=>{setFollowUpVisible(true);narrate(question.follow_up)}}>Continue to follow-up <ArrowRight size={16}/></Button>}
          </Panel>:null}
          {completed?<Panel title="Resume mock complete">
            <p className="muted">Five responses are saved. Compare each answer with its resume evidence.</p>
            <div className="resume-previews">{current.questions.map((item,index)=><details key={item.id}>
              <summary>{index+1}. {item.question}</summary>
              <p className="reference-text">{current.turns[index]?.answer}</p>
              <strong>Resume reference</strong><p className="muted">{item.reference_answer}</p>
              <strong>Follow-up</strong><p>{item.follow_up}</p>
              {current.turns[index]?.follow_up_answer?<p className="reference-text">{current.turns[index].follow_up_answer}</p>:null}
            </details>)}</div>
          </Panel>:null}
        </>:null}
      </div>
    </div>
  </>;
}
