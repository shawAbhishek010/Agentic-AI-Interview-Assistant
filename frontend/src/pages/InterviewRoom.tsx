import {useEffect,useRef,useState} from 'react';
import {ArrowRight,BookOpen,Bot,Check,CheckCircle2,ChevronRight,Clock,ClosedCaption,Keyboard,Mic,MicOff,Pause,Play,Send,ShieldCheck,Square,Volume2,VolumeX} from 'lucide-react';
import {errorMessage,post} from '../api';
import type {Session,Turn} from '../types';
import {Avatar,Badge,Button,Citation,Empty,ErrorBox,Modal,ModeNote,PageHeading,Panel} from '../components';
import {useVoice} from '../voice';
import {InterviewConversation,isTutoringRequest} from '../InterviewConversation';
import type {ConversationHandle} from '../InterviewConversation';

function interviewerReply(turn:Turn){
  return [turn.evaluation.coaching?.text??'Thanks for your answer. Let’s try a follow-up.',turn.evaluation.follow_up].join(' ');
}
const isNextQuestion=(text:string)=>/^(?:please )?(?:next(?: question)?|continue(?: to (?:the )?next question)?|move on)[.!?]*$/i.test(text.trim());
const spokenAnswerStart=/^(?:my answer is|here['’]?s my answer|i(?:['’]?m| am) ready to answer|let me answer)(?:[\s,.!?:-]+|$)/i;

export function InterviewRoom({session,hasRetiredQuestions,onUpdate,refresh,start,review,notify}:{session:Session|null;hasRetiredQuestions:boolean;onUpdate:(s:Session)=>void;refresh:()=>Promise<void>;start:()=>void;review:()=>void;notify:(s:string)=>void}){
  const [answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[paused,setPaused]=useState(false),[captions,setCaptions]=useState(true),[consent,setConsent]=useState(false),[ending,setEnding]=useState(false),[elapsed,setElapsed]=useState(0),[reviewing,setReviewing]=useState<Turn|null>(null);
  const answerRef=useRef<HTMLTextAreaElement>(null);
  const conversation=useRef<ConversationHandle>(null),lastNarrated=useRef('');
  const [spoken,setSpoken]=useState(true),[chatBusy,setChatBusy]=useState(false),[dialogue,setDialogue]=useState(false),[tutoring,setTutoring]=useState(false);
  const dialogueActive=useRef(false),voiceEpoch=useRef(0),spokenEnabled=useRef(true),pausedRef=useRef(false),reviewingRef=useRef<Turn|null>(null),answerBusy=useRef(false);
  const listenNext=useRef<()=>void>(()=>{}),candidateTurn=useRef<(text:string)=>void>(()=>{});
  spokenEnabled.current=spoken;pausedRef.current=paused;reviewingRef.current=reviewing;
  const voice=useVoice(text=>setAnswer(text.slice(0,12000)));
  const active=session?.status==='active'&&!hasRetiredQuestions;
  const question=session?.questions.find(q=>q.id===reviewing?.question_id)??session?.questions[session.turns.length];
  const helpRequest=isTutoringRequest(answer);
  const stopDialogue=()=>{dialogueActive.current=false;voiceEpoch.current++;setDialogue(false);voice.stop()};
  const stopAll=()=>{stopDialogue();conversation.current?.stop()};
  const say=(text:string)=>{
    const epoch=voiceEpoch.current;
    voice.speak(text,{onEnd:()=>{if(dialogueActive.current&&voiceEpoch.current===epoch&&!pausedRef.current)listenNext.current()},onError:stopDialogue});
  };
  const setSpokenReplies=(enabled:boolean)=>{lastNarrated.current=`${session?.id}:${question?.id}`;spokenEnabled.current=enabled;setSpoken(enabled)};
  const deliverChatReply=(text:string)=>{if(!dialogueActive.current)return false;if(!reviewingRef.current)setTutoring(true);say(text);return true};
  listenNext.current=()=>{
    if(!dialogueActive.current||pausedRef.current||answerBusy.current)return;
    voice.listen({onTranscript:text=>{if(reviewingRef.current||tutoring)conversation.current?.draft(text);else setAnswer(text.slice(0,12000))},onComplete:text=>candidateTurn.current(text),onError:stopDialogue});
  };
  useEffect(()=>{stopAll();lastNarrated.current='';setReviewing(null);setTutoring(false);setAnswer('');setError('');setElapsed(session?Math.max(0,Math.round((Date.now()-new Date(session.created_at).getTime())/1000)):0)},[session?.id]);
  useEffect(()=>{voice.stop()},[question?.id,paused]);
  useEffect(()=>{if(hasRetiredQuestions)stopAll()},[hasRetiredQuestions]);
  useEffect(()=>{if(spoken&&active&&!paused&&!reviewing&&question){const key=`${session?.id}:${question.id}`;if(lastNarrated.current!==key){lastNarrated.current=key;say(question.question)}}},[session?.id,question?.id,active,paused,reviewing,spoken]);
  useEffect(()=>()=>{dialogueActive.current=false;voiceEpoch.current++},[]);
  useEffect(()=>{if(!active||paused)return;const timer=setInterval(()=>setElapsed(n=>n+1),1000);return()=>clearInterval(timer)},[active,paused]);
  const submit=async(text=answer)=>{
    if(!session||!question||answerBusy.current||!text.trim())return;
    if(isTutoringRequest(text)){setTutoring(true);conversation.current?.ask(text);setAnswer('');return}
    const epoch=voiceEpoch.current;conversation.current?.stop();voice.stop();setTutoring(false);answerBusy.current=true;setBusy(true);setError('');
    try{
      const next=await post<Session>(`/interviews/${session.id}/answers`,{question_id:question.id,answer:text},65000);
      onUpdate(next);const saved=next.turns[next.turns.length-1];reviewingRef.current=saved;setReviewing(saved);
      await refresh();notify('Answer and feedback saved');
      if(spokenEnabled.current&&voiceEpoch.current===epoch&&!pausedRef.current)say(interviewerReply(saved));
    }catch(e){setError(errorMessage(e));stopDialogue()}
    finally{answerBusy.current=false;setBusy(false)}
  };
  const finish=async(cancel=false)=>{if(!session)return;stopAll();setBusy(true);setError('');try{const next=await post<Session>(`/interviews/${session.id}/finish`,{cancel});onUpdate(next);setEnding(false);await refresh();review()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}};
  const nextQuestion=()=>{conversation.current?.stop();voice.stop();setReviewing(null);reviewingRef.current=null;setAnswer('');setTimeout(()=>answerRef.current?.focus(),0)};
  const pause=()=>{stopAll();setPaused(!paused)};
  const resumeAnswer=()=>{
    setTutoring(false);
    conversation.current?.draft('');
    if(dialogueActive.current&&question)say(question.question);
    else answerRef.current?.focus();
  };
  candidateTurn.current=text=>{
    if(!dialogueActive.current||pausedRef.current)return;
    if(reviewingRef.current){
      if(isNextQuestion(text)){if(session?.turns.length===5)void finish();else nextQuestion()}
      else conversation.current?.ask(text);
    }else if(tutoring){
      if(spokenAnswerStart.test(text)){
        const candidateAnswer=text.replace(spokenAnswerStart,'').trim();
        if(candidateAnswer)void submit(candidateAnswer);
        else resumeAnswer();
      }else conversation.current?.ask(text);
    }else void submit(text);
  };
  const beginMic=()=>{setConsent(false);conversation.current?.stop();setSpokenReplies(true);dialogueActive.current=true;setDialogue(true);if(question)say(reviewing?interviewerReply(reviewing):question.question)};
  if(!session)return <><PageHeading title="AI interview" description="Set up a five-question interview for the role you want to practice."/><div className="interview-welcome"><div><h2>Practice with Ava</h2><p>Choose a role and answer five theory questions. Ava can read questions and feedback aloud.</p><Button onClick={start}>Set up your interview <ArrowRight size={16}/></Button><p className="interview-welcome-notes">Type your answers or enable voice during the session.</p></div><Avatar/></div></>;
  if(hasRetiredQuestions)return <><PageHeading title="Start a theory interview" description="This saved session contains a question that has been removed from the active bank."/><Panel><Empty title="Your progress is saved" description="Start a new session to continue with theory questions." icon={<BookOpen size={27}/>} action={<div className="inline-actions"><Button onClick={start}>Start a theory interview</Button>{session.turns.length?<Button variant="secondary" onClick={review}>Review saved answers</Button>:null}</div>}/></Panel></>;
  if(!active)return <><PageHeading title={session.status==='completed'?'Interview completed':'Interview ended'} description="Your answers and source-backed feedback are waiting for you."/><Panel><Empty title={session.status==='completed'?'Interview completed':'Interview saved and ended'} description={`${session.turns.length} of 5 questions answered. You can revisit your feedback at any time.`} icon={<CheckCircle2 size={27}/>} action={<div className="inline-actions"><Button onClick={review}>Review feedback <ArrowRight size={16}/></Button><Button variant="secondary" onClick={start}>Start another interview</Button></div>}/></Panel></>;
  return <><PageHeading title="Your interview room" description="Answer the current question, then review feedback and discuss the follow-up." action={<Badge tone={paused?'amber':'cyan'}><span className="status-dot"/>{paused?'Paused':'Session in progress'}</Badge>}/><div className="interview-layout">
  <div className="interview-question"><Panel className="current-question-panel"><div className="panel-heading"><h2><MessagesIcon/>Current question</h2><button className="text-button" aria-label="Read question aloud" onClick={()=>question&&say(question.question)} disabled={!question||paused}><Volume2 size={16}/>Read aloud</button></div><div className="question-position"><span>{String(Math.min(session.turns.length+(reviewing?0:1),5)).padStart(2,'0')}</span><div className="question-progress-dots">{session.questions.map((q,i)=><i key={q.id} className={i<session.turns.length?'done':i===session.turns.length?'current':''}/>)}</div></div><h3>{question?.question||'You’ve answered all five questions.'}</h3>{question?<><div className="question-meta"><Badge tone="subtle">{question.difficulty}</Badge><Badge tone="subtle">{question.topic}</Badge></div><Citation source={question.source}/></>:null}</Panel>
</div>
  <div className="interview-side">
  <div className="interview-media"><div className="interview-stage"><div className="stage-top"><div><strong className="stage-role">{session.role}</strong></div><span className="timer"><Clock size={14}/>{String(Math.floor(elapsed/60)).padStart(2,'0')}:{String(elapsed%60).padStart(2,'0')}</span></div><div className="stage-center"><div className="stage-caption"><span className={voice.listening?'recording-dot':'status-dot'}/>{voice.listening?'MICROPHONE ACTIVE':voice.preparing?'PREPARING A SPOKEN REPLY':voice.speaking?'AVA IS SPEAKING':paused?'SESSION PAUSED':reviewing?'YOUR ANSWER IS SAVED':'READY TO PRACTICE'}</div><Avatar speaking={voice.speaking}/><div className="stage-name"><strong>Ava <span>your practice interviewer</span></strong></div></div><div className="stage-bottom"><span className="stage-privacy"><ShieldCheck size={13}/>Mic requires consent</span><span className="stage-count">Question {Math.min(reviewing?session.turns.length:session.turns.length+1,5)} / 5</span></div></div>
    <div className="spoken-replies-bar"><button className="text-button" aria-pressed={spoken} onClick={()=>{const enabled=!spoken;setSpokenReplies(enabled);if(enabled&&question)say(reviewing?interviewerReply(reviewing):question.question);else stopAll()}} disabled={paused}>{spoken?<Volume2 size={16}/>:<VolumeX size={16}/>}Spoken replies {spoken?'on':'off'}</button></div>{dialogue?<p className="voice-state" role="status">{busy||chatBusy?"Ava is thinking...":voice.speaking?"Ava is speaking. Your turn follows the reply.":voice.preparing?"Preparing a spoken reply...":voice.listening?"Your turn: listening to the candidate.":"Voice interview is active."} {reviewing?"Answer the follow-up or ask for clarification. Say next question to continue." :tutoring?"Keep asking about this question, or say ‘My answer is…’ when you’re ready.":"Answer the question or ask Ava to explain it."}</p>:null}<div className="interview-controls"><button className={`control-button ${captions?'selected':''}`} aria-label={captions?'Hide live transcript':'Show live transcript'} aria-pressed={captions} onClick={()=>setCaptions(!captions)}><ClosedCaption size={21}/><span>Captions</span></button><button className="control-button" aria-label="Focus typed answer" onClick={()=>answerRef.current?.focus()}><Keyboard size={21}/><span>Type answer</span></button><button className={`mic-control ${voice.listening?'recording':''}`} aria-label={dialogue?'Stop voice interview':'Start voice interview'} disabled={!dialogue&&(paused||busy||chatBusy||!question)} onClick={()=>{if(dialogue)stopAll();else if(!voice.supported)voice.listen();else{voice.stop();setConsent(true)}}}>{voice.listening?<MicOff size={26}/>:<Mic size={26}/>}</button><button className={`control-button ${paused?'selected':''}`} aria-label={paused?'Resume interview':'Pause interview'} aria-pressed={paused} onClick={pause}>{paused?<Play size={21}/>:<Pause size={21}/>}<span>{paused?'Resume':'Pause'}</span></button><button className="control-button end-control" aria-label="End interview" onClick={()=>{stopAll();setEnding(true)}} disabled={busy}><Square size={18}/><span>End session</span></button></div>
</div>
  <aside className="interview-rail">
    {reviewing?<Panel title="Answer feedback" className="quick-feedback"><div className="quick-score"><span>{reviewing.evaluation.score}<small>/ 100</small></span><Badge tone="cyan">Concept coverage</Badge></div><p className="small-text muted">Rule-based rubric · lexical matching</p><div className="quick-feedback-concepts">{reviewing.evaluation.matched_concepts.slice(0,2).map(c=><div key={c}><Check size={14}/>{c}</div>)}</div><div className="follow-up-preview"><strong>One step further</strong><p>{reviewing.evaluation.follow_up}</p>{reviewing.evaluation.follow_up_mode==='local_slm'?<span className="small-text muted">Local SLM follow-up · Built with Llama</span>:null}</div></Panel>:captions?<Panel title="Live transcript" className="transcript-panel"><span className="transcript-status"><span className={voice.listening?'recording-dot':'status-dot'}/>{voice.listening?'Listening now':'Typed & spoken answer'}</span><p className={answer?'transcript-content':'muted'}>{answer||'Your words will appear here. Enable your microphone or type your answer to begin.'}</p><div className="transcript-footer"><Mic size={14}/>{voice.listening?'Microphone is active':'Microphone is off'}</div></Panel>:null}
    <div className="interview-tip"><SparkTip/><div><strong>Answer structure</strong><p>Explain the idea, give an example, then connect it to a practical use.</p></div></div><ModeNote mode={session.mode}/>
  </aside>
  </div>
  <div className="interview-composer">
    {reviewing?<Panel title="Ava, your interviewer" className="interviewer-reply-panel" action={<button className="text-button" onClick={()=>say(interviewerReply(reviewing))} disabled={paused}><Volume2 size={14}/>Replay reply</button>}><p data-testid="interviewer-reply" className="interviewer-reply-text">{interviewerReply(reviewing)}</p>{reviewing.evaluation.coaching?<ModeNote mode={reviewing.evaluation.coaching.mode} model={reviewing.evaluation.coaching.model}/>:null}</Panel>:null}
    {tutoring&&!reviewing?<Panel title="Talk it through"><p className="conversation-intro">Keep asking questions. When you’re ready to give your interview answer, say “My answer is…” or use the button below.</p><Button variant="secondary" disabled={paused||busy||chatBusy} onClick={resumeAnswer}>Ready to answer</Button></Panel>:null}
    <Panel className="answer-panel"><div className="panel-heading"><h2>{reviewing?'Your saved answer':'Your answer'}</h2><span className="small-text muted">{reviewing?'Saved securely':`${answer.length.toLocaleString()} / 12,000`}</span></div>{reviewing?<div className="saved-answer">{reviewing.answer}</div>:<><label className="sr-only" htmlFor="interview-answer">Your interview answer</label><textarea id="interview-answer" ref={answerRef} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder={paused?'Resume the interview to continue…':'Take your time. Type your answer here, or enable the microphone to think out loud…'} maxLength={12000} disabled={paused||busy||chatBusy||!question}/></>}{helpRequest&&!reviewing?<p className="info-note">This looks like a request for help. Ask Ava will explain it without grading or advancing your interview.</p>:null}{error?<ErrorBox message={error}/>:null}{voice.error?<ErrorBox message={voice.error}/>:null}<div className="answer-actions"><span className="answer-helper"><ShieldCheck size={14}/>{reviewing?'Rule-based feedback compares cited concepts.':'Your answer is saved when you submit.'}</span>{reviewing?<><Button variant="secondary" disabled={chatBusy||paused} onClick={()=>conversation.current?.ask('Help me understand my saved answer. What did I get right, and what could I improve? Give a short example if it helps.')}>Explain this feedback</Button><Button onClick={()=>session.turns.length===5?void finish():nextQuestion()} busy={busy} disabled={chatBusy}>{session.turns.length===5?'Finish & review':'Next question'}<ArrowRight size={16}/></Button></>:question?<Button disabled={paused||chatBusy||!answer.trim()} busy={busy} onClick={()=>void submit()}>{helpRequest?'Ask Ava instead':'Submit answer'} <Send size={15}/></Button>:<Button onClick={()=>void finish()} busy={busy}>Finish & review <ArrowRight size={16}/></Button>}</div></Panel><InterviewConversation ref={conversation} session={session} question={question} onUpdate={onUpdate} voice={voice} spoken={spoken} setSpoken={setSpokenReplies} disabled={paused||busy} onBusy={setChatBusy} onReply={deliverChatReply} onVoiceStart={stopDialogue} onFailure={stopDialogue}/>
  </div>
  </div>
  {consent?<Modal title="Start a conversational interview" onClose={()=>setConsent(false)}><div className="consent-icon"><Mic size={30}/></div><p>Ava will read each question and reply aloud while keeping the text visible. When she finishes, your microphone listens for your answer or cross-question. Say “I don’t know” or ask about anything unclear to start a tutoring conversation. When you’re ready to submit your answer, say “My answer is…” followed by your answer.</p><p className="muted">Your browser may use its speech service provider. Placement AI stores text, not microphone audio. Listening resumes after each reply until you stop or pause. You can keep typing instead.</p><div className="modal-actions"><Button variant="secondary" onClick={()=>{setConsent(false);answerRef.current?.focus()}}>Keep typing</Button><Button onClick={beginMic}><Mic size={16}/>Allow & start voice interview</Button></div></Modal>:null}
  {ending?<Modal title="Ready to leave the room?" onClose={()=>setEnding(false)}><p>{session.turns.length===5?'All five answers are saved. Finish your interview and review your feedback.':'Your submitted answers will stay saved. Ending now closes this session; you can start a new one whenever you’re ready.'}</p>{error?<ErrorBox message={error}/>:null}<div className="modal-actions"><Button variant="secondary" onClick={()=>setEnding(false)} disabled={busy}>Keep practicing</Button><Button variant={session.turns.length===5?'':'danger'} busy={busy} onClick={()=>void finish(session.turns.length<5)}>{session.turns.length===5?'Finish interview':'Save & end session'}<ChevronRight size={16}/></Button></div></Modal>:null}
  </>
}
function MessagesIcon(){return <Bot size={17}/>}
function SparkTip(){return <span className="tip-icon"><CheckCircle2 size={19}/></span>}
