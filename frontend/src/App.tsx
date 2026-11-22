import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {ArrowRight,ArrowUpRight,LayoutDashboard,Bot,Library,FileText,ChartNoAxesCombined,Layers,Search,Bell,ChevronDown,ChevronRight,Menu,Settings,LogOut,HelpCircle,ShieldCheck,Mic,X,CheckCircle2,BookOpen} from 'lucide-react';
import {api,post,getToken,setToken,clearToken,errorMessage,ApiError} from './api';
import type {Catalog,Overview,Page,PracticeSet,Question,Session,SourceDocument,TopicScore,User,Workspace} from './types';
import {Badge,Button,ErrorBox,Logo,Modal,Spinner} from './components';
const Dashboard=lazy(()=>import('./pages/Dashboard').then(m=>({default:m.Dashboard})));
const PracticeLibrary=lazy(()=>import('./pages/PracticeLibrary').then(m=>({default:m.PracticeLibrary})));
const InterviewRoom=lazy(()=>import('./pages/InterviewRoom').then(m=>({default:m.InterviewRoom})));
const Feedback=lazy(()=>import('./pages/Feedback').then(m=>({default:m.Feedback})));
const Analytics=lazy(()=>import('./pages/Analytics').then(m=>({default:m.Analytics})));
const ResumeMock=lazy(()=>import('./pages/ResumeMock').then(m=>({default:m.ResumeMock})));
const KnowledgeBase=lazy(()=>import('./pages/KnowledgeBase').then(m=>({default:m.KnowledgeBase})));

const nav:{id:Page;label:string;icon:typeof Bot;tag?:string}[]=[
  {id:'dashboard',label:'Overview',icon:LayoutDashboard},
  {id:'interview',label:'AI Interview',icon:Bot,tag:'AVA'},
  {id:'library',label:'Practice Library',icon:Library},
  {id:'feedback',label:'Feedback & Analytics',icon:ChartNoAxesCombined},
  {id:'resume',label:'Resume Mock',icon:FileText},
  {id:'knowledge',label:'Knowledge Base',icon:Layers,tag:'RAG'},
];
const currentPage=():Page=>{
  const hash=location.hash.slice(1);
  return hash==='analytics'||nav.some(item=>item.id===hash)?hash as Page:'dashboard';
};
const difficultyLabels={beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced'};

export default function App(){
  const [user,setUser]=useState<User|null>(null),[authLoading,setAuthLoading]=useState(!!getToken());
  const [workspace,setWorkspace]=useState<Workspace|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [page,setPage]=useState<Page>(currentPage),[mobileNav,setMobileNav]=useState(false),[role,setRole]=useState('Frontend Developer');
  const [mobileViewport,setMobileViewport]=useState(()=>window.matchMedia('(max-width: 760px)').matches);
  const sidebarRef=useRef<HTMLElement>(null);
  const [session,setSession]=useState<Session|null>(null),[setup,setSetup]=useState(false),[starting,setStarting]=useState(false),[setupError,setSetupError]=useState('');
  const hasRetiredQuestions=!!(workspace?.catalog.interview_options&&session?.status==='active'&&
    session.questions.slice(session.turns.length).some(q=>!workspace.questions.some(available=>available.id===q.id)));
  const [topic,setTopic]=useState(''),[difficulty,setDifficulty]=useState(''),[librarySearch,setLibrarySearch]=useState('');
  const interviewOptions=workspace?.catalog.interview_options;
  const setupRoles=(workspace?.catalog.roles??[]).filter(name=>!interviewOptions||interviewOptions[name]?.['']);
  const setupRole=setupRoles.includes(role)?role:setupRoles[0]??'';
  const roleOptions=interviewOptions?.[setupRole];
  const setupTopics=roleOptions?Object.keys(roleOptions).filter(Boolean):workspace?.catalog.topics??[];
  const setupTopic=setupTopics.includes(topic)?topic:'';
  const setupLevels=Object.entries(difficultyLabels).filter(([level])=>!roleOptions||roleOptions[setupTopic]?.includes(level));
  const setupDifficulty=setupLevels.some(([level])=>level===difficulty)?difficulty:'';
  const [search,setSearch]=useState(''),[account,setAccount]=useState(false),[help,setHelp]=useState(false),[notifications,setNotifications]=useState(false),[toast,setToast]=useState('');
  const mounted=useRef(true);
  const navigate=useCallback((next:Page)=>{location.hash=next;setPage(next);setMobileNav(false);setNotifications(false)},[]);
  useEffect(()=>{const onHash=()=>setPage(currentPage());window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[]);
  useEffect(()=>{const media=window.matchMedia('(max-width: 760px)');const update=()=>{setMobileViewport(media.matches);if(!media.matches)setMobileNav(false)};media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
  useEffect(()=>{
    if(!mobileNav||!mobileViewport)return;
    const previous=document.activeElement;
    sidebarRef.current?.querySelector<HTMLElement>('.nav-item.active')?.focus();
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setMobileNav(false);return}
      if(event.key!=='Tab')return;
      const items=Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')??[]);
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    };
    document.addEventListener('keydown',keyboard);
    return()=>{document.removeEventListener('keydown',keyboard);if(previous instanceof HTMLElement&&previous.isConnected)previous.focus()};
  },[mobileNav,mobileViewport]);
  const notify=useCallback((message:string)=>setToast(message),[]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer)},[toast]);
  const refresh=useCallback(async()=>{
    const [catalog,overview,topics,questions,bookmarks,sets,sources,sessions]=await Promise.all([api<Catalog>('/catalog'),api<Overview>('/analytics/overview'),api<TopicScore[]>('/analytics/topics'),api<Question[]>('/questions'),api<string[]>('/bookmarks'),api<PracticeSet[]>('/practice/sets'),api<SourceDocument[]>('/sources'),api<Session[]>('/interviews')]);
    if(mounted.current)setWorkspace({catalog,overview,topics,questions,bookmarks,sets,sources,sessions});
  },[]);
  const load=useCallback(async()=>{setLoading(true);setError('');try{await refresh()}catch(e){setError(errorMessage(e));if(e instanceof ApiError&&e.status===401){clearToken();setUser(null)}}finally{setLoading(false)}},[refresh]);
  useEffect(()=>{mounted.current=true;if(getToken())api<User>('/me').then(setUser).catch(e=>{setError(errorMessage(e));if(e instanceof ApiError&&e.status===401)clearToken()}).finally(()=>setAuthLoading(false));return()=>{mounted.current=false}},[]);
  useEffect(()=>{if(user)void load()},[user,load]);
  useEffect(()=>{if(!workspace)return;setRole(r=>workspace.catalog.roles.includes(r)?r:workspace.catalog.roles[0]??'');const id=localStorage.getItem('placement_ai_session');if(id&&!session){const saved=workspace.sessions.find(s=>s.id===id);if(saved)setSession(saved)}},[workspace,session]);
  const updateSession=(next:Session)=>{setSession(next);localStorage.setItem('placement_ai_session',next.id)};
  const start=async(options?:{role?:string;topic?:string;question_ids?:string[]})=>{
    setStarting(true);setSetupError('');
    try{const next=await post<Session>('/interviews',{role:options?.role??setupRole,...(options?.question_ids?{question_ids:options.question_ids}:{...((options?.topic??setupTopic)?{topic:options?.topic??setupTopic}:{}),...(setupDifficulty?{difficulty:setupDifficulty}:{})})});updateSession(next);setSetup(false);navigate('interview');await refresh()}
    catch(e){navigate('interview');setSetupError(errorMessage(e));setSetup(true)}finally{setStarting(false)}
  };
  const requestStart=(nextRole?:string,nextTopic?:string)=>{navigate('interview');if(nextRole)setRole(nextRole);setTopic(nextTopic??'');setDifficulty('');setSetupError('');setSetup(true)};
  const signOut=()=>{clearToken();localStorage.removeItem('placement_ai_session');setUser(null);setWorkspace(null);setSession(null);setAccount(false);navigate('dashboard')};
  const openSession=(next:Session,review=false)=>{updateSession(next);navigate(review||next.status!=='active'?'feedback':'interview')};
  if(authLoading)return <div className="boot-screen"><Logo/><Spinner/><p>Opening your workspace…</p></div>;
  if(!user)return <Auth onAuth={u=>{setUser(u);setError('')}} initialError={error}/>;

  const activeSection=page==='analytics'?'feedback':page;
  return <div className="app-shell">
    {mobileNav?<button className="nav-scrim" aria-label="Close navigation" onClick={()=>setMobileNav(false)}/>:null}
    <aside ref={sidebarRef} id="workspace-navigation" className={`sidebar ${mobileNav?'open':''}`} inert={mobileViewport&&!mobileNav} role={mobileViewport&&mobileNav?'dialog':undefined} aria-modal={mobileViewport&&mobileNav?true:undefined} aria-label="Workspace navigation"><a href="#dashboard" className="brand-link" aria-label="Placement AI home" onClick={()=>navigate('dashboard')}><Logo/></a>
      <p className="workspace-section-label">Workspace</p>
      <nav aria-label="Main navigation">{nav.map(({id,label,icon:Icon,tag})=><a key={id} href={`#${id}`} className={`nav-item ${activeSection===id?'active':''}`} onClick={()=>navigate(id)} aria-current={activeSection===id?'page':undefined}><Icon size={18}/><span className="nav-label">{label}</span>{tag?<small className="nav-tag" aria-hidden="true">{tag}</small>:null}</a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tools"><button onClick={()=>setAccount(true)}><Settings size={17}/> Settings</button><button onClick={()=>setHelp(true)}><HelpCircle size={17}/> Help & resources <ArrowUpRight size={13}/></button></div><button className="profile-button" onClick={()=>setAccount(true)}><span className="profile-avatar">{user.name.slice(0,2).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.role==='ADMIN'?'Administrator':'Student workspace'}</small></span><ChevronDown size={15}/></button></div>
    </aside>
    <div className="workspace-main"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={mobileNav} onClick={()=>setMobileNav(true)}><Menu size={22}/></button><span>Workspace</span><ChevronRight size={13}/><strong>{nav.find(n=>n.id===activeSection)?.label}</strong></div><div className="topbar-right"><form className="global-search" onSubmit={e=>{e.preventDefault();setLibrarySearch(search);navigate('library')}}><Search size={16}/><input aria-label="Search questions" placeholder="Search questions" value={search} onChange={e=>setSearch(e.target.value)}/><kbd>↵</kbd></form><button className={workspace?.catalog.model?.status==='ready'?'mode-top is-ready':'mode-top'} onClick={()=>navigate('knowledge')}><span/>{workspace?.catalog.model?.status==='ready'?'Local SLM ready':'Demo mode'}</button><div className="notification-wrap"><button className="icon-button" aria-label="Notifications" aria-expanded={notifications} onClick={()=>setNotifications(!notifications)}><Bell size={19}/></button>{notifications?<div className="notification-popover"><strong>Your workspace is up to date</strong><p>{workspace?.overview.questions_practiced?`${workspace.overview.questions_practiced} answers saved. Review your feedback to plan your next session.`:'Your first interview is waiting. Your progress will appear after you practice.'}</p><button className="text-button" onClick={()=>{navigate('analytics');setNotifications(false)}}>View progress <ArrowRight size={14}/></button></div>:null}</div><button className="top-profile" aria-label="Account settings" onClick={()=>setAccount(true)}>{user.name.charAt(0).toUpperCase()}</button></div></header>
      <main id="main-content" className="page-content"><a className="skip-link" href="#page-start" onClick={event=>{event.preventDefault();document.getElementById("page-start")?.focus()}}>Skip to content</a><div id="page-start" tabIndex={-1}/><div className="workspace-content">{error?<ErrorBox message={error} retry={()=>void load()}/>:null}{loading&&!workspace?<div className="page-skeleton" aria-label="Loading workspace"><div/><div/><div/><div/></div>:null}
        {workspace?<Suspense fallback={<div className="inline-loading"><Spinner/>Opening your workspace…</div>}>
          {page==='dashboard'?<Dashboard data={workspace} user={user} role={role} setRole={setRole} start={()=>requestStart()} navigate={navigate} openSession={openSession} openTopic={topic=>{setLibrarySearch(topic);navigate('library')}}/>:null}
          {page==='library'?<PracticeLibrary data={workspace} role={role} setRole={setRole} search={librarySearch} setSearch={setLibrarySearch} refresh={refresh} notify={notify} start={requestStart} startSet={(set)=>void start({role:set.role,question_ids:set.question_ids})}/>:null}
          {page==='interview'?<InterviewRoom session={session} hasRetiredQuestions={hasRetiredQuestions} onUpdate={updateSession} refresh={refresh} start={()=>requestStart()} review={()=>navigate('feedback')} notify={notify}/>:null}
          {activeSection==='feedback'?<div className="tabs review-tabs" aria-label="Feedback and analytics views">
            <button className={page==='feedback'?'active':''} aria-pressed={page==='feedback'} onClick={()=>navigate('feedback')}>Feedback</button>
            <button className={page==='analytics'?'active':''} aria-pressed={page==='analytics'} onClick={()=>navigate('analytics')}>Analytics</button>
          </div>:null}
          {page==='feedback'?<Feedback session={session} data={workspace} openSession={openSession} start={()=>requestStart(session?.role)} navigate={navigate}/>:null}
          {page==='analytics'?<Analytics data={workspace} openSession={openSession} start={()=>requestStart()} refresh={refresh} notify={notify} onDeleted={id=>{if(session?.id===id){localStorage.removeItem('placement_ai_session');setSession(null)}}}/>:null}
          {page==='resume'?<ResumeMock roles={workspace.catalog.roles}/>:null}
          {page==='knowledge'?<KnowledgeBase data={workspace} user={user} refresh={refresh} notify={notify}/>:null}
        </Suspense>:!loading?<div className="service-empty"><Bot size={36}/><h1>Your workspace is almost ready</h1><p>Start the API and agent services, then reload your workspace.</p><Button onClick={()=>void load()}>Reload workspace <ArrowRight size={16}/></Button></div>:null}
        </div><footer className="workspace-footer"><span>CSL374 / Project 10</span></footer>
      </main>
    </div>
    {setup?<Modal title="Set up an interview" onClose={()=>{if(!starting)setSetup(false)}}><div className="setup-intro"><span className="setup-icon"><Bot size={26}/></span><div><strong>Session format</strong><p>Five theory questions with reference answers and a follow-up for each.</p></div></div><form onSubmit={e=>{e.preventDefault();void start()}}><label className="field">Your target role<select value={setupRole} onChange={e=>{setRole(e.target.value);setTopic('');setDifficulty('')}}>{setupRoles.map(r=><option key={r}>{r}</option>)}</select></label><div className="form-row"><label className="field">Focus topic<select value={setupTopic} onChange={e=>{setTopic(e.target.value);setDifficulty('')}}><option value="">A balanced mix</option>{setupTopics.map(t=><option key={t}>{t}</option>)}</select></label><label className="field">Difficulty<select value={setupDifficulty} onChange={e=>setDifficulty(e.target.value)}><option value="">Mixed difficulty</option>{setupLevels.map(([level,label])=><option key={level} value={level}>{label}</option>)}</select></label></div><div className="info-note"><ShieldCheck size={17}/><span>Questions and scores use source-grounded rules. Optional local SLM follow-ups are labelled when generated. You can type or opt in to browser speech.</span></div>{session?.status==='active'?<p className="muted small-text">Your current session will remain saved in session history.</p>:null}{setupError?<ErrorBox message={setupError}/>:null}<div className="modal-actions"><Button variant="secondary" type="button" onClick={()=>setSetup(false)} disabled={starting}>Cancel</Button><Button busy={starting} disabled={!setupRole} type="submit">Start interview <ArrowRight size={16}/></Button></div></form></Modal>:null}
    {account?<Modal title="Your workspace" onClose={()=>setAccount(false)}><div className="account-card"><span className="profile-avatar large">{user.name.charAt(0)}</span><div><h3>{user.name}</h3><p>{user.email}</p><Badge>{user.role==='ADMIN'?'Administrator':'Student'}</Badge></div></div><div className="settings-row"><div><strong>Privacy & saved data</strong><p>Answers and progress belong to this account. Delete sessions in Feedback & Analytics.</p></div><ShieldCheck size={20}/></div><div className="settings-row"><div><strong>Voice is always optional</strong><p>Microphone access starts only with your consent. Browser speech recognition may use a vendor service; audio is not stored by Placement AI.</p></div><Mic size={20}/></div><div className="settings-row"><div><strong>Source-grounded practice</strong><p>Rubrics use lexical concept coverage. Local SLM status: {workspace?.catalog.model?.status??'not checked'}. Generated text is labelled separately; no paid provider is enabled.</p></div><Bot size={20}/></div><div className="modal-actions"><Button variant="secondary" onClick={()=>{setAccount(false);navigate('analytics')}}>Manage sessions</Button><Button variant="danger" onClick={signOut}><LogOut size={16}/>Sign out</Button></div></Modal>:null}
    {help?<Modal title="Help & resources" onClose={()=>setHelp(false)}><div className="help-steps">{[['01','Choose your role','Start a five-question interview backed by the licensed public Q&A bank.'],['02','Make it a conversation','Type your answer or opt in to speech recognition. Replay a question with browser text-to-speech.'],['03','Learn from your answer','Review source concepts, a transparent demo rubric, and a follow-up. Your real progress is saved.']].map(([n,t,d])=><div key={n}><span>{n}</span><section><h3>{t}</h3><p>{d}</p></section></div>)}</div><div className="info-note"><BookOpen size={18}/><span>The initial source contains JavaScript, React, Node.js, HTML, CSS and accessibility questions. Source examples may use older APIs; always review the cited reference.</span></div><Button onClick={()=>{setHelp(false);navigate('knowledge')}}>Explore the knowledge base <ArrowRight size={16}/></Button></Modal>:null}
    {toast?<div className="toast" role="status"><CheckCircle2 size={18}/>{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={16}/></button></div>:null}
  </div>
}

function Auth({onAuth,initialError}:{onAuth:(u:User)=>void;initialError:string}){
  const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(initialError);
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const authenticate=async(mode:'demo'|'login'|'register',event?:FormEvent)=>{event?.preventDefault();setBusy(true);setError('');try{const result=await post<{token:string;user:User}>(`/auth/${mode}`,mode==='demo'?{}:mode==='register'?{name,email,password}:{email,password});setToken(result.token);onAuth(result.user)}catch(e){setError(errorMessage(e))}finally{setBusy(false)}};
  return <main className="auth-page">
    <aside className="auth-art" aria-label="About Placement AI">
      <Logo/>
      <div className="auth-copy">
        <h2>Prepare for your next interview</h2>
        <p>Practice for your target role and review your answers in one workspace.</p>
        <ul className="auth-features">
          <li><Bot size={20}/><div><strong>Role-specific interviews</strong><p>Answer five questions by typing or using your microphone.</p></div></li>
          <li><BookOpen size={20}/><div><strong>Source-backed feedback</strong><p>Compare your answers with cited references.</p></div></li>
          <li><ChartNoAxesCombined size={20}/><div><strong>Saved progress</strong><p>Review past sessions and see what to practice next.</p></div></li>
        </ul>
      </div>
      <small>CSL374 / Project 10</small>
    </aside>
    <section className="auth-form-wrap" aria-labelledby="auth-heading">
      <div className="auth-form">
        <h1 id="auth-heading">{register?"Create an account":"Sign in to Placement AI"}</h1>
        <p>{register?"Save your practice sessions and feedback.":"Continue to your interview workspace."}</p>
        <form onSubmit={e=>void authenticate(register?"register":"login",e)}>
          {register?<label className="field">Your name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required maxLength={80} placeholder="Your name"/></label>:null}
          <label className="field">Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required maxLength={254} placeholder="you@example.com"/></label>
          <label className="field">Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={register?"new-password":"current-password"} required minLength={register?10:1} maxLength={72} placeholder={register?"At least 10 characters":"Enter your password"}/></label>
          {error?<ErrorBox message={error}/>:null}
          <Button type="submit" className="full-width" busy={busy}>{register?"Create account":"Sign in"}<ArrowRight size={16}/></Button>
        </form>
        <p className="auth-switch">{register?"Already have an account?":"New here?"} <button onClick={()=>{setRegister(!register);setError("")}}>{register?"Sign in":"Create an account"}</button></p>
        <div className="auth-divider"><span>or</span></div>
        <Button variant="secondary" className="demo-button" onClick={()=>void authenticate("demo")} busy={busy}><Bot size={17}/>Explore demo workspace<ArrowRight size={16}/></Button>
        <div className="auth-trust"><ShieldCheck size={17}/><p>Demo workspaces are isolated. Practice scores use a rule-based rubric. Local model responses are labelled.</p></div>
      </div>
    </section>
  </main>;
}
