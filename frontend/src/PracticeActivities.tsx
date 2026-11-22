import {useEffect,useRef,useState} from 'react';
import {Lightbulb,Play,RotateCcw} from 'lucide-react';
import {api,errorMessage,post} from './api';
import {Badge,Button,ErrorBox,Panel,Spinner} from './components';
import type {Challenge,CodingLanguage,CodingReply,RunResult} from './coding-types';

const LANGUAGES:Record<CodingLanguage,string>={javascript:'JavaScript',java:'Java',python:'Python'};
const PLAYGROUND_START='const values = [1, 2, 3];\nconsole.log(values.map(value => value * 2));\n';

export function CodingPractice(){
  const [challenges,setChallenges]=useState<Challenge[]>([]);
  const [challengeId,setChallengeId]=useState('');
  const [language,setLanguage]=useState<CodingLanguage>('javascript');
  const [mode,setMode]=useState<'challenge'|'playground'>('challenge');
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [running,setRunning]=useState(false);
  const [coaching,setCoaching]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<RunResult|null>(null);
  const [reply,setReply]=useState<CodingReply|null>(null);
  const activeWorker=useRef<Worker|null>(null);
  const runTimer=useRef<number|undefined>(undefined);

  useEffect(()=>{
    let active=true;
    api<{challenges:Challenge[]}>('/coding/challenges').then(({challenges:items})=>{
      if(active){setChallenges(items);setChallengeId(items[0]?.id??'')}
    }).catch(error=>{if(active)setError(errorMessage(error))}).finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false;activeWorker.current?.terminate();window.clearTimeout(runTimer.current)};
  },[]);

  const challenge=challenges.find(item=>item.id===challengeId);
  const key=mode==='playground'?'playground':challengeId+'-'+language;
  const starter=mode==='playground'?PLAYGROUND_START:(challenge?.starter[language]??'');
  const code=drafts[key]??starter;
  const disabled=running||coaching;

  function resetOutput(){
    setResult(null);
    setReply(null);
    setError('');
  }

  function run(){
    if(running||!code.trim())return;
    resetOutput();
    let worker:Worker;
    try {
      worker=new Worker(new URL('./coding-worker.ts',import.meta.url),{type:'module'});
    } catch {
      setError('The JavaScript sandbox could not start.');
      return;
    }
    setRunning(true);
    activeWorker.current=worker;
    function finish(outcome:RunResult){
      if(activeWorker.current!==worker)return;
      window.clearTimeout(runTimer.current);
      worker.terminate();
      activeWorker.current=null;
      setResult(outcome);
      setRunning(false);
    }
    worker.onmessage=event=>finish(event.data as RunResult);
    worker.onerror=()=>finish({cases:[],logs:[],error:'The JavaScript sandbox could not start.'});
    runTimer.current=window.setTimeout(()=>finish({cases:[],logs:[],error:'Timed out. Check for a long or infinite loop.'}),9000);
    worker.postMessage({code,examples:mode==='challenge'?(challenge?.examples??[]):[]});
  }

  async function coach(action:'hint'|'review'){
    if(!challenge||disabled)return;
    setCoaching(true);
    setError('');
    setReply(null);
    try {
      setReply(await post<CodingReply>('/coding/coach',{challenge_id:challenge.id,language,action,code},45000));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setCoaching(false);
    }
  }

  return <div className="practice-studio">
    <div className="tabs coding-view-tabs" role="group" aria-label="Coding views">
      <button className={mode==='challenge'?'active':''} aria-pressed={mode==='challenge'} disabled={disabled} onClick={()=>{resetOutput();setMode('challenge')}}>Challenges</button>
      <button className={mode==='playground'?'active':''} aria-pressed={mode==='playground'} disabled={disabled} onClick={()=>{resetOutput();setMode('playground')}}>JavaScript playground</button>
    </div>
    {error?<ErrorBox message={error}/>:null}
    {mode==='challenge'&&loading?<div className="inline-loading"><Spinner/>Loading challenges…</div>:null}
    {mode==='playground'||challenge?<div className="practice-studio-grid">
      {mode==='challenge'&&challenge?<Panel title="Beginner challenges">
        <label className="field">Challenge<select value={challengeId} onChange={event=>{resetOutput();setChallengeId(event.target.value)}} disabled={disabled}>
          {challenges.map((item,index)=><option value={item.id} key={item.id}>{index+1}. {item.title}</option>)}
        </select></label>
        <div className="challenge-description"><h3>{challenge.title}</h3><p>{challenge.prompt}</p></div>
        <h3 className="challenge-examples-title">Examples</h3>
        <ul className="challenge-examples">{challenge.examples.map((example,index)=><li key={index}>
          <code>solve({example.input.map(input=>JSON.stringify(input)).join(', ')})</code><span>{JSON.stringify(example.expected)}</span>
        </li>)}</ul>
      </Panel>:<Panel title="Playground"><p className="muted">Run JavaScript in a browser sandbox. Use <code>console.log()</code> to inspect your output.</p></Panel>}
      <Panel title="Code editor" className="coding-editor" action={mode==='playground'?<span className="small-text muted">JavaScript</span>:undefined}>
        {mode==='challenge'?<div className="tabs code-language-tabs" role="group" aria-label="Programming language">
          {(Object.keys(LANGUAGES) as CodingLanguage[]).map(item=><button key={item} className={item===language?'active':''} aria-pressed={item===language} disabled={disabled} onClick={()=>{resetOutput();setLanguage(item)}}>{LANGUAGES[item]}</button>)}
        </div>:null}
        <label className="sr-only" htmlFor="coding-editor">Your code</label>
        <textarea id="coding-editor" value={code} disabled={disabled} maxLength={12000} spellCheck={false} autoCapitalize="off" onChange={event=>{resetOutput();setDrafts(previous=>({...previous,[key]:event.target.value}))}}/>
        <div className="coding-actions">
          {(mode==='playground'||language==='javascript')?<Button disabled={!code.trim()||coaching} busy={running} onClick={run}><Play size={15}/>{mode==='challenge'?'Run examples':'Run JavaScript'}</Button>:null}
          {mode==='challenge'?<>
            <Button variant="secondary" disabled={disabled} onClick={()=>void coach('hint')}><Lightbulb size={15}/>Get a hint</Button>
            <Button variant="secondary" disabled={!code.trim()||running} busy={coaching} onClick={()=>void coach('review')}>Review code</Button>
          </>:null}
          <button className="text-button" disabled={disabled||code===starter} onClick={()=>{resetOutput();setDrafts(previous=>({...previous,[key]:starter}))}}><RotateCcw size={14}/>Reset editor</button>
        </div>
        {mode==='challenge'&&language!=='javascript'?<p className="small-text muted">Hints and review are available for {LANGUAGES[language]}. The browser playground executes JavaScript.</p>:null}
        {coaching?<p className="small-text muted" role="status">Waiting for the local coding coach…</p>:null}
        {reply?<section className="coding-output" aria-live="polite"><div className="panel-heading"><h3>Coding coach</h3><Badge tone="subtle">{reply.mode==='local_slm'?'Local Llama':'Built-in hint'}</Badge></div>{reply.warning?<p className="small-text muted">{reply.warning}</p>:null}<p className="reference-text">{reply.text}</p></section>:null}
        {result?<section className="coding-output" aria-live="polite">
          <h3>{mode==='challenge'?'Example results':'Console'}</h3>
          {result.error?<ErrorBox message={result.error}/>:null}
          {result.cases.map((item,index)=><div className="coding-case" key={index}><span>Example {index+1}</span><Badge tone={item.passed?'cyan':'amber'}>{item.passed?'Passed':'Failed'}</Badge><code>Expected {item.expected} · Got {item.actual}</code></div>)}
          {result.logs.length?<pre>{result.logs.join('\n')}</pre>:null}
          {!result.logs.length&&!result.cases.length&&!result.error?<p className="muted">Finished with no output.</p>:null}
        </section>:null}
      </Panel>
    </div>:null}
  </div>;
}

const BEHAVIORAL_QUESTIONS=[
  ['A deadline slipped. How did you handle it?','Explain what changed, how you communicated, and how you adjusted the plan.'],
  ['Tell me about a disagreement on your team.','Describe what each side needed and how you worked toward a decision.'],
  ['Describe a time you made a mistake.','Show how you identified it, took responsibility, and prevented a repeat.'],
  ['Tell me about a project with unclear requirements.','Explain what you clarified and what you did while waiting for answers.'],
  ['Tell me about a time you learned something quickly.','Explain how you chose what to learn, applied it, and checked your understanding.'],
  ['Describe a time you received difficult feedback.','Give a concrete change you made and what happened afterward.'],
  ['Tell me about a time you had to prioritize competing tasks.','Describe your criteria, the trade-off you made, and its impact.'],
  ['Tell me about helping someone overcome a blocker.','Explain how you identified the blocker and what you did to help.'],
];

export function BehavioralPractice(){
  return <Panel title="Behavioral questions">
    <p className="muted">Practice with a real example. Cover the situation, task, action, and result.</p>
    <div className="behavioral-questions">{BEHAVIORAL_QUESTIONS.map(([question,prompt])=><details key={question}>
      <summary>{question}</summary><p>{prompt}</p>
    </details>)}</div>
  </Panel>;
}
