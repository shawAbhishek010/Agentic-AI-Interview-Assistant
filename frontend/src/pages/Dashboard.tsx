import {ArrowRight,ChevronRight} from 'lucide-react';
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import type {Page,Session,User,Workspace} from '../types';
import {ArrowLink,Badge,Button,Empty,formatDate,PageHeading,Panel} from '../components';

export function Dashboard({data,user,role,setRole,start,navigate,openSession,openTopic}:{
  data:Workspace;user:User;role:string;setRole:(role:string)=>void;start:()=>void;
  navigate:(page:Page)=>void;openSession:(session:Session)=>void;openTopic:(topic:string)=>void;
}){
  const {overview,catalog}=data;
  const stats=[
    {label:'Interviews completed',value:overview.interviews_completed,detail:'Last 30 days'},
    {label:'Questions practiced',value:overview.questions_practiced,detail:'Across '+overview.topics_covered+' topics'},
    {label:'Average practice score',value:overview.average_score===null?'—':overview.average_score+'%',detail:'Concept coverage'},
    {label:'Practice streak',value:overview.streak,detail:overview.streak===1?'Consecutive day':'Consecutive days'},
  ];
  const roleTopics=Object.keys(catalog.interview_options?.[role]??{}).filter(Boolean);
  const topics=(roleTopics.length?roleTopics:catalog.topics).slice(0,3);

  return <>
    <PageHeading title={'Welcome back, '+user.name.split(' ')[0]+'.'} description="Prepare for your next interview and keep track of your practice."/>
    <section className="ready-panel" aria-labelledby="interview-plan-title">
      <div className="plan-heading">
        <h2 id="interview-plan-title">Your next interview</h2>
        <p>Five theory questions, typed or spoken answers, and cited feedback.</p>
      </div>
      <div className="plan-actions">
        <label className="field">Target role
          <select value={role} onChange={event=>setRole(event.target.value)}>
            {catalog.roles.map(item=><option key={item}>{item}</option>)}
          </select>
        </label>
        <Button onClick={start}>Start an interview<ArrowRight size={16}/></Button>
      </div>
    </section>

    <section aria-labelledby="overview-activity">
      <div className="section-heading"><h2 id="overview-activity">Practice activity</h2><ArrowLink onClick={()=>navigate('analytics')}>View analytics</ArrowLink></div>
      <dl className="stats-grid">{stats.map(stat=><div className="stat-card" key={stat.label}>
        <dt className="stat-label">{stat.label}</dt>
        <dd className="stat-value">{stat.value}</dd>
        <dd className="stat-detail">{stat.detail}</dd>
      </div>)}</dl>
    </section>

    <div className="dashboard-mid">
      <Panel title="Practice score trend" action={<span className="small-text muted">Last 30 days</span>} className="trend-panel">
        {overview.score_trend.length?<><ScoreChart data={overview.score_trend}/>
          <p className="small-text muted chart-privacy-note">Daily average of rule-based practice scores.</p></>:<Empty
          title="No practice scores yet"
          description="Your score trend appears after you submit an answer."
        />}
      </Panel>
      <Panel title="Practice topics" className="topic-panel">
        <div className="dashboard-topics">{topics.map(topic=><button type="button" key={topic} onClick={()=>openTopic(topic)}>
          <strong>{topic}</strong><small>{data.questions.filter(question=>question.topic===topic).length} questions</small><ChevronRight size={15}/>
        </button>)}</div>
        <ArrowLink onClick={()=>navigate('library')}>View practice library</ArrowLink>
      </Panel>
    </div>

    <Panel title="Recent interviews" action={<ArrowLink onClick={()=>navigate('analytics')}>View all activity</ArrowLink>} className="recent-panel">
      {overview.recent_interviews.length?<div className="table-scroll" tabIndex={0} role="region" aria-label="Recent interview results">
        <table className="session-table">
          <thead><tr><th scope="col">Interview</th><th scope="col">Date</th><th scope="col">Progress</th><th scope="col">Status</th></tr></thead>
          <tbody>{overview.recent_interviews.map(session=><tr key={session.id}>
            <th scope="row"><button className="session-name" onClick={()=>openSession(session)}><span>
              <strong>{session.role}</strong><small>{session.topic||'Mixed topics'} · {session.difficulty||'Mixed difficulty'}</small>
            </span><ChevronRight size={15}/></button></th>
            <td>{formatDate(session.created_at,true)}</td><td>{session.turns.length} / 5 answers</td>
            <td><Badge tone={session.status==='completed'?'cyan':session.status==='active'?'violet':'subtle'}>{session.status}</Badge></td>
          </tr>)}</tbody>
        </table>
      </div>:<Empty title="No interviews yet" description="Your sessions and saved answers will appear here."/>}
    </Panel>
  </>;
}

export function ScoreChart({data}:{data:{date:string;score:number}[]}){
  return <div className="score-chart" aria-label="Practice score trend">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{top:12,right:18,bottom:8,left:0}}>
        <CartesianGrid stroke="var(--line)" vertical={false}/>
        <XAxis dataKey="date" tickFormatter={date=>formatDate(String(date),true)} stroke="var(--muted)" fontSize={12} axisLine={false} tickLine={false} tickMargin={10}/>
        <YAxis domain={[0,100]} width={44} tickFormatter={value=>value+'%'} stroke="var(--muted)" fontSize={12} axisLine={false} tickLine={false}/>
        <Tooltip contentStyle={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:6,color:'var(--text)'}} formatter={value=>[value+'%','Practice score']}/>
        <Line type="linear" dataKey="score" stroke="var(--accent)" strokeWidth={2} dot={{r:3,fill:'var(--accent)',stroke:'var(--surface)'}} isAnimationActive={false}/>
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
