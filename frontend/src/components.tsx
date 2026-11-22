import {useEffect,useRef,useId} from 'react';
import type {ReactNode} from 'react';
import {X,ArrowRight,ExternalLink,LoaderCircle,BookOpen,CheckCircle2,AlertCircle,Radio,GraduationCap} from 'lucide-react';
import type {ModelInfo,Source,Trace} from './types';
import {safeUrl} from './api';

export function Logo(){return <div className="logo"><span className="logo-mark"><GraduationCap size={28}/></span><span>Placement <b>AI</b></span></div>}
export function Spinner(){return <LoaderCircle size={18} className="spin" aria-label="Loading"/>}
export function Button({children,variant='',className='',busy=false,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string;busy?:boolean}){return <button {...props} disabled={props.disabled||busy} className={`button ${variant} ${className}`} aria-busy={busy}>{busy?<Spinner/>:null}{children}</button>}
export function Badge({children,tone='violet'}:{children:ReactNode;tone?:string}){return <span className={`badge ${tone}`} aria-hidden={children==='NEW'?true:undefined}>{children}</span>}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div className="error-box" role="alert"><AlertCircle size={18}/><span>{message}</span>{retry?<button className="text-button" onClick={retry}>Retry</button>:null}</div>}
export function Empty({title,description,action,icon}:{title:string;description:string;action?:ReactNode;icon?:ReactNode}){return <div className="empty-state">{icon?<div className="empty-icon" aria-hidden="true">{icon}</div>:null}<h3>{title}</h3><p>{description}</p>{action}</div>}
export function Panel({title,action,children,className=''}:{title?:string;action?:ReactNode;children:ReactNode;className?:string}){return <section className={`panel ${className}`}>{title?<div className="panel-heading"><h2>{title}</h2>{action}</div>:null}{children}</section>}
export function PageHeading({title,description,action}:{title:string;description:string;action?:ReactNode}){return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>}
export function Citation({source}:{source:Source}){const href=safeUrl(source.url);return <a className="citation" href={href} target="_blank" rel="noopener noreferrer"><BookOpen size={14}/><span>{source.title}<small>{source.locator} · {source.license}</small></span><ExternalLink size={13}/></a>}
export function ReferenceText({text,className=''}:{text:string;className?:string}){
  const parts=text.split(/^[ \t]*\x60{3}[^\r\n\x60]*\r?\n([\s\S]*?)\r?\n[ \t]*\x60{3}[ \t]*\r?$/gm);
  return <div className={'reference-text '+className}>{parts.map((part,index)=>index%2
    ?<pre key={index}><code>{part}</code></pre>
    :part.trim()?<p key={index}>{part.trim()}</p>:null)}</div>;
}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);const titleId=useId();
  useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close()},[]);
  return <dialog ref={ref} className={`modal ${wide?'wide':''}`} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div><div className="modal-body">{children}</div></dialog>
}
export function Avatar({speaking=false}:{speaking?:boolean}){
  return <div className={speaking?'avatar-scene speaking':'avatar-scene'}>
    <img src="/assets/ava-portrait.png" alt="AVA wearing an interview headset" decoding="async"/>
  </div>;
}
export function TraceView({trace}:{trace:Trace[]}){return <div className="trace-list">{trace.map((t,i)=><div className="trace-item" key={`${t.step}-${i}`}><span className="trace-check"><CheckCircle2 size={17}/></span><div><strong>{t.step.replaceAll('_',' ')}</strong><p>{t.detail}</p></div><small>{t.duration_ms.toFixed(1)} ms</small></div>)}</div>}
export function ModeNote({mode='demo',model}:{mode?:string;model?:ModelInfo}){return <span className="mode-note"><Radio size={13}/>{mode==='local_slm'?`Local SLM · ${model?.model_id??'local model'} · Built with Llama`:'Demo / rule-based · source-grounded'} · no paid calls</span>}
export function ArrowLink({children,onClick}:{children:ReactNode;onClick:()=>void}){return <button className="text-button" onClick={onClick}>{children}<ArrowRight size={15}/></button>}
export function formatDate(date:string,short=false){return new Date(date).toLocaleDateString(undefined,{month:'short',day:'numeric',...(short?{}:{year:'numeric'})})}
