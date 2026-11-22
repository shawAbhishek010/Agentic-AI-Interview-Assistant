import {useState} from 'react';
import {ArrowRight,CheckCircle2,ChevronLeft,ChevronRight,Lightbulb,RotateCcw} from 'lucide-react';
import type {Page,Session,Workspace} from '../types';
import {Badge,Button,Citation,Empty,formatDate,ModeNote,PageHeading,Panel,ReferenceText,TraceView} from '../components';

export function Feedback({session,data,openSession,start,navigate}:{
  session:Session|null;data:Workspace;openSession:(session:Session,review?:boolean)=>void;start:()=>void;navigate:(page:Page)=>void;
}){
  const [selected,setSelected]=useState(0),[showTrace,setShowTrace]=useState(false);
  const turnIndex=Math.min(selected,Math.max(0,(session?.turns.length??1)-1));
  const turn=session?.turns[turnIndex];
  const question=session?.questions.find(item=>item.id===turn?.question_id);
  const evaluation=turn?.evaluation;
  const savedSessions=data.sessions.filter(item=>item.turns.length);

  return <>
    <PageHeading title="Feedback & review" description="Review your answer, reference material, and the follow-up."
      action={evaluation?<Button variant="secondary" onClick={start}><RotateCcw size={16}/>Practice again</Button>:null}/>
    {!session||!turn||!question||!evaluation?<Panel>
      <Empty title="No recorded practice" description="Submit an interview answer to see feedback here."
        action={<Button onClick={start}>Start an interview <ArrowRight size={16}/></Button>}/>
      {savedSessions.length?<div className="saved-session-picker">
        <label className="field">Review a saved interview
          <select value={session?.id??''} onChange={event=>{
            const saved=savedSessions.find(item=>item.id===event.target.value);
            if(saved)openSession(saved,true);
          }}>
            <option value="">Choose a session</option>
            {savedSessions.map(item=><option key={item.id} value={item.id}>{item.role} · {formatDate(item.created_at)}</option>)}
          </select>
        </label>
      </div>:null}
    </Panel>:<>
      <div className="feedback-session-bar">
        <div><div><strong>{session.role}</strong><span>{formatDate(session.created_at)} · {session.turns.length} answers saved</span></div></div>
        <div className="feedback-turn-picker">
          <button className="icon-button" aria-label="Previous answer" disabled={turnIndex<=0} onClick={()=>setSelected(turnIndex-1)}><ChevronLeft size={18}/></button>
          <select aria-label="Review answer" value={turnIndex} onChange={event=>setSelected(Number(event.target.value))}>
            {session.turns.map((item,index)=><option key={item.question_id} value={index}>Question {index+1} of {session.turns.length}</option>)}
          </select>
          <button className="icon-button" aria-label="Next answer" disabled={turnIndex>=session.turns.length-1} onClick={()=>setSelected(turnIndex+1)}><ChevronRight size={18}/></button>
        </div>
      </div>
      <div className="feedback-question"><Badge tone="subtle">{question.topic}</Badge><h2>{question.question}</h2></div>
      <div className="feedback-layout">
        <Panel className="review-document">
          <section className="review-section"><h2>Your answer</h2><p className="student-answer">{turn.answer}</p></section>
          <section className="review-section"><h2>Reference answer</h2><ReferenceText text={question.answer}/><Citation source={question.source}/></section>
          <section className="review-section follow-up-panel">
            <h2>Follow-up</h2><p>{evaluation.follow_up}</p>
            <p className="small-text muted">{evaluation.follow_up_mode==='local_slm'?'Try this locally generated follow-up aloud. Built with Llama.':'Try this follow-up aloud. It is a deterministic template grounded in the cited question.'}</p>
          </section>
        </Panel>
        <aside className="feedback-side">
          <Panel className="review-document">
            <section className="review-section">
              <h2>Your practice score</h2>
              <div className="score-summary"><strong>{evaluation.score}<small>/100</small></strong><span>Rule-based rubric</span></div>
              <p className="score-description">A guide for practice, based on lexical concept coverage. This score is not an SLM assessment.</p>
              <dl className="rubric-scores">
                <div><dt>Accuracy proxy</dt><dd>{evaluation.accuracy}%</dd></div>
                <div><dt>Completeness</dt><dd>{evaluation.completeness}%</dd></div>
                <div><dt>Clarity proxy</dt><dd>{evaluation.clarity}%</dd></div>
              </dl>
            </section>
            <section className="review-section">
              <h2>Concept coverage</h2>
              <div className="feedback-concepts">
                {evaluation.matched_concepts.length?evaluation.matched_concepts.map(concept=><div className="concept matched" key={concept}><CheckCircle2 size={16}/><span>{concept}</span></div>)
                  :<p className="muted small-text">No source concepts matched yet.</p>}
                {evaluation.missing_concepts.map(concept=><div className="concept missing" key={concept}><Lightbulb size={16}/><span>{concept}</span></div>)}
              </div>
            </section>
            <section className="review-section">
              <h2>About this feedback</h2>
              <div className="rubric-explanation">{evaluation.feedback.map((item,index)=><p key={index}>{item}</p>)}</div>
            </section>
          </Panel>
        </aside>
      </div>
      <Panel title="Behind the interview" action={<button className="text-button" onClick={()=>setShowTrace(!showTrace)} aria-expanded={showTrace}>{showTrace?'Hide':'Inspect'} workflow <ChevronRight size={15}/></button>}>
        {showTrace?<TraceView trace={session.trace}/>:<div className="workflow-caption"><p>See the retrieval, question selection, and study planning steps.</p><ModeNote mode={session.mode}/></div>}
      </Panel>
      <div className="feedback-bottom">
        <Button variant="secondary" onClick={()=>navigate('analytics')}>See your progress <ArrowRight size={16}/></Button>
        {session.status==='active'?<Button onClick={()=>openSession(session)}>Continue interview <ArrowRight size={16}/></Button>:null}
      </div>
    </>}
  </>;
}
