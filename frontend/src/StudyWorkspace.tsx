import {useEffect,useState} from 'react';
import {BookOpen,Download,FileText,Plus,Search,Trash2,Upload} from 'lucide-react';
import {api,errorMessage,post} from './api';
import type {StudyDocument,StudyMaterial} from './types';
import {Badge,Button,ErrorBox,Panel,Spinner} from './components';

function studyReferences(material: StudyMaterial) {
  const numbers = new Map(material.sources.map((source, index) => [source.id, index + 1]));
  return (ids: string[]) => Array.from(new Set(ids.flatMap(id => numbers.get(id) ?? []))).join(', ');
}

function wordText(text: string) {
  return text.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '').trim();
}

async function downloadStudyMaterial(material: StudyMaterial) {
  const {Document, HeadingLevel, Packer, Paragraph, TextRun} = await import('docx');
  const references = studyReferences(material);
  const citedText = (text: string, ids: string[]) => {
    const numbers = references(ids);
    return numbers ? wordText(text) + ' [' + numbers + ']' : text;
  };
  const runs = (text: string) => wordText(text).split(/\r\n?|\n/).map((line, index) =>
    new TextRun({text:line, break:index ? 1 : 0})
  );
  const heading = (text: string) => new Paragraph({
    text:wordText(text).replace(/\s+/g, ' '),
    heading:HeadingLevel.HEADING_1,
  });
  const title = wordText(material.title).replace(/\s+/g, ' ');
  const paragraphs = [new Paragraph({text:title, heading:HeadingLevel.TITLE})];
  if (material.mode === 'extractive' && material.warning) {
    paragraphs.push(new Paragraph({children:[new TextRun({text:wordText(material.warning), italics:true})]}));
  }
  if (material.summary) {
    paragraphs.push(heading('Overview'), new Paragraph({
      children:runs(citedText(material.summary, material.summary_citation_ids ?? [])),
    }));
  }
  if (material.bullets?.length) {
    paragraphs.push(heading('Key points'));
    for (const bullet of material.bullets) {
      paragraphs.push(new Paragraph({children:runs(bullet), bullet:{level:0}}));
    }
  }
  for (const section of material.sections ?? []) {
    paragraphs.push(heading(section.heading));
    if (material.mode === 'local_slm' && section.mode === 'extractive') {
      paragraphs.push(new Paragraph({children:[new TextRun({text:'Source excerpt', italics:true})]}));
    }
    paragraphs.push(new Paragraph({children:runs(citedText(section.text, section.citation_ids))}));
  }
  for (const [index, entry] of (material.questions ?? []).entries()) {
    paragraphs.push(heading((index + 1) + '. ' + entry.question), new Paragraph({
      children:[new TextRun({text:'Answer. ', bold:true}), ...runs(citedText(entry.answer, entry.citation_ids))],
    }));
  }
  if (material.sources.length) {
    paragraphs.push(heading('References'));
    for (const [index, source] of material.sources.entries()) {
      paragraphs.push(new Paragraph({text:(index + 1) + '. ' + wordText(source.title + ' — ' + source.locator).replace(/\s+/g, ' ')}));
    }
  }
  const documentFile = new Document({title, creator:'Placement AI', sections:[{children:paragraphs}]});
  const url = URL.createObjectURL(await Packer.toBlob(documentFile));
  const fileName = Array.from(title.replace(/[^\p{L}\p{N}]+/gu, '-')).slice(0, 80).join('').replace(/^-|-$/g, '');
  const link = document.createElement('a');
  link.href = url;
  link.download = (fileName || 'study-material') + '.docx';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StudyOutput({material}: {material: StudyMaterial}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const references = studyReferences(material);
  const citation = (ids: string[]) => {
    const numbers = references(ids);
    return numbers ? <small>References {numbers}</small> : null;
  };
  const download = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadStudyMaterial(material);
    } catch {
      setDownloadError('Could not create the Word document. Try downloading it again.');
    } finally {
      setDownloading(false);
    }
  };
  return <Panel title={material.title} action={<Button variant="secondary" busy={downloading} onClick={() => void download()}><Download size={15}/>Download Word</Button>}>
    <div className="study-output">
      {downloadError && <ErrorBox message={downloadError}/>}
      <Badge tone={material.mode === 'local_slm' ? 'cyan' : 'amber'}>
        {material.mode === 'local_slm' ? 'Generated locally · Built with Llama' : 'Source-extracted material'}
      </Badge>
      {material.warning && <p className="info-note">{material.warning}</p>}
      {material.summary && <div className="study-overview">
        <h3>Overview</h3>
        <p className="study-summary">{material.summary}</p>
        {citation(material.summary_citation_ids ?? [])}
      </div>}
      {!!material.bullets?.length && <ul>{material.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>}
      {material.sections?.map((section, index) => <article className="study-section" key={index}>
        <h3>{section.heading}</h3>
        {material.mode === 'local_slm' && section.mode === 'extractive' && <small>Source excerpt</small>}
        <p>{section.text}</p>
        {citation(section.citation_ids)}
      </article>)}
      {material.questions?.map((entry, index) => <article className="study-question" key={index}>
        <h3>{index + 1}. {entry.question}</h3>
        <p>{entry.answer}</p>
        {citation(entry.citation_ids)}
      </article>)}
      {!!material.sources.length && <details className="study-citations">
        <summary>View {material.sources.length} cited passages</summary>
        {material.sources.map((source, index) => <article key={source.id}>
          <strong>{index + 1}. {source.locator}</strong>
          <p>{source.excerpt}</p>
        </article>)}
      </details>}
    </div>
  </Panel>;
}

export function StudyWorkspace(){
  const [documents,setDocuments]=useState<StudyDocument[]>([]),[selected,setSelected]=useState<StudyDocument|null>(null),[material,setMaterial]=useState<StudyMaterial|null>(null),[file,setFile]=useState<File|null>(null),[title,setTitle]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [kind,setKind]=useState<'notes'|'questions'>('notes'),[request,setRequest]=useState('Explain the main ideas in simple language, with key points and an example.'),[count,setCount]=useState(5);
  const refresh=async()=>setDocuments(await api<StudyDocument[]>('/documents'));
  useEffect(()=>{let live=true;api<StudyDocument[]>('/documents').then(rows=>{if(live)setDocuments(rows)}).catch(e=>{if(live)setError(errorMessage(e))}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
  const open=async(id:string)=>{setBusy(true);setError('');try{const doc=await api<StudyDocument>(`/documents/${id}`);setSelected(doc);setMaterial(doc.materials?.[0]??null)}catch(e){setError(errorMessage(e))}finally{setBusy(false)}};
  const upload=async()=>{if(!file)return;setBusy(true);setError('');try{if(file.size>5_000_000)throw new Error('Maximum document size is 5 MB.');const form=new FormData();form.set('file',file);form.set('title',title.trim());const doc=await api<StudyDocument>('/documents/import',{method:'POST',body:form});setSelected(doc);setMaterial(null);setFile(null);setTitle('');await refresh()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}};
  const generate=async()=>{if(!selected)return;setBusy(true);setError('');try{const result=await post<StudyMaterial>(`/documents/${selected.id}/generate`,{kind,request,count},65000);setMaterial(result);setSelected({...selected,materials:[result,...(selected.materials??[])].slice(0,20)})}catch(e){setError(errorMessage(e))}finally{setBusy(false)}};
  const remove=async(doc:StudyDocument)=>{if(!window.confirm(`Delete “${doc.title}” and its saved notes and questions?`))return;setBusy(true);setError('');try{await api(`/documents/${doc.id}`,{method:'DELETE'});if(selected?.id===doc.id){setSelected(null);setMaterial(null)}await refresh()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}};
  return <div className="study-workspace">{error?<ErrorBox message={error}/>:null}<div className={selected||documents.length?"study-grid":"study-grid study-first-upload"}><aside className="study-sidebar"><Panel title="Your study documents" action={<span className="small-text muted">{documents.length} / 20</span>}>
    {loading?<Spinner/>:documents.length?<div className="study-document-list">{documents.map(doc=><div className={selected?.id===doc.id?'selected':''} key={doc.id}><button onClick={()=>void open(doc.id)} disabled={busy}><FileText size={18}/><span><strong>{doc.title}</strong><small>{doc.chunk_count} passages · {doc.file_name}</small></span></button><button className="icon-button" aria-label={`Delete study document ${doc.title}`} onClick={()=>void remove(doc)} disabled={busy}><Trash2 size={15}/></button></div>)}</div>:<p className="muted">Upload a document to create notes or practice questions.</p>}
    <form className="study-upload" onSubmit={e=>{e.preventDefault();void upload()}}><label className="field">Document file<input type="file" aria-label="Upload study document file" accept=".pdf,.docx,.txt,.md" onChange={e=>setFile(e.target.files?.[0]??null)} required disabled={busy}/></label><label className="field">Title (optional)<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={200} placeholder="e.g. Operating systems — Unit 2" disabled={busy}/></label><p className="muted small-text">PDF, DOCX, TXT or Markdown · up to 5 MB. Files are private to your account.</p><Button type="submit" busy={busy} disabled={!file}><Upload size={16}/>Upload private document</Button></form>
    </Panel></aside><div className="study-content">{selected?<><Panel title={selected.title}><details className="source-preview"><summary><Search size={15}/>Preview extracted text</summary><p>{selected.excerpt}</p></details><form onSubmit={e=>{e.preventDefault();void generate()}}><div className="study-kind"><button type="button" className={kind==='notes'?'selected':''} onClick={()=>setKind('notes')} disabled={busy}><BookOpen size={17}/>Explain with notes</button><button type="button" className={kind==='questions'?'selected':''} onClick={()=>setKind('questions')} disabled={busy}><Plus size={17}/>Create practice questions</button></div><label className="field">What would you like to learn?<textarea aria-label="Study material request" value={request} onChange={e=>setRequest(e.target.value)} required minLength={2} maxLength={2000} rows={3} disabled={busy}/></label>{kind==='questions'?<label className="field">Number of questions<select aria-label="Study question count" value={count} onChange={e=>setCount(Number(e.target.value))} disabled={busy}>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>:null}<Button type="submit" busy={busy} disabled={request.trim().length<2}>{kind==='notes'?'Generate notes':'Generate questions'}</Button><p className="small-text muted">Answers cite passages from this document. Generation can take several seconds.</p></form></Panel>
    {material?<StudyOutput key={material.id} material={material}/>:null}
    {(selected.materials?.length??0)>1?<Panel title="Saved study materials"><div className="study-history">{selected.materials?.map(m=><button key={m.id} onClick={()=>setMaterial(m)}><FileText size={15}/><span>{m.title}<small>{m.request}</small></span><Badge tone="subtle">{m.kind}</Badge></button>)}</div></Panel>:null}</>:documents.length?<p className="study-selection muted">Select a document to view its saved materials.</p>:null}</div></div></div>
}
