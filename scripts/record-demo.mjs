/** Record real browser/API actions and combine them with offline Windows narration. */
import {createRequire} from 'node:module';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {mkdir,writeFile,copyFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

const root=fileURLToPath(new URL('../',import.meta.url));
const frontendRequire=createRequire(new URL('../frontend/package.json',import.meta.url));
const {chromium,expect}=frontendRequire('@playwright/test');
const base=process.env.DEMO_BASE_URL??'http://127.0.0.1:8088';
const dryRun=process.argv.includes('--dry-run');
const runtime=path.join(root,'.runtime','demo');
const output=path.join(root,'docs','demo-output');
await mkdir(runtime,{recursive:true});
await mkdir(output,{recursive:true});

async function preflight(){
  const health=await fetch(base+'/api/health').then(r=>r.json());
  if(health.agent_status!=='ok')throw new Error('Start healthy application services before recording.');
  const authResponse=await fetch(base+'/api/auth/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(!authResponse.ok)throw new Error('Demo sign-in is unavailable.');
  const auth=await authResponse.json();
  const headers={Authorization:`Bearer ${auth.token}`};
  const catalog=await fetch(base+'/api/catalog',{headers}).then(r=>r.json());
  const sources=await fetch(base+'/api/sources',{headers}).then(r=>r.json());
  const modelResponse=await fetch(base+'/api/model/status',{headers});
  const model=modelResponse.ok?await modelResponse.json():{status:'unavailable'};
  if(!dryRun&&model.status!=='ready')throw new Error('A final model-enabled recording requires /api/model/status to report ready. Use --dry-run to check browser actions without making model claims.');
  return {catalog,sources,model};
}
const verified=await preflight();
const chunks=verified.sources.reduce((sum,s)=>sum+s.chunk_count,0);
const chapters=[
  {id:'01-introduction',seconds:30,title:'Placement AI / Project 10 / Setup',narration:'Placement A I implements CSL three seven four, project ten: the interview preparation bot. Setup starts with scripts slash init env dot P S one, which creates local secrets. Then run docker compose up, dash dash build, dash d. Open localhost port eight zero eight eight. This automated recording shows real application responses. Default practice and the separate local model test are clearly distinguished.'},
  {id:'02-overview',seconds:25,title:'An isolated student workspace',narration:'Explore demo workspace creates an isolated ordinary student account. This overview begins with empty progress because no answers have been submitted. Interview counts, scores, streaks, and charts come from saved activity. The application does not present invented statistics. The navigation opens the interview room, question library, feedback, analytics, and the knowledge base.'},
  {id:'03-provenance',seconds:25,title:'Licensed data and source provenance',narration:`The knowledge base currently contains ${verified.catalog.question_count} public question and answer records, split into ${chunks} overlapping chunks. Each question retains its source title, repository locator, and license. The original M I T notice is included in the project. Source management is administrator-only; a student can inspect references without gaining import or deletion privileges.`},
  {id:'04-interview',seconds:25,title:'Exactly five source-grounded questions',narration:'We now choose a React developer interview. Setup retrieves a role-compatible question bank and selects exactly five distinct questions. Each question has a reference answer and one follow-up. The interviewer is an animated robot, rather than live video. Voice is optional: the browser first explains microphone consent, and the typed-answer path remains available.'},
  {id:'05-rest-contract',seconds:25,title:'Actual REST response from this session',narration:'This panel displays the actual REST response returned for the interview created during this recording. It lists the five question identifiers, question text, reference answers, follow-ups, and citations. These are live source-backed records, not a fabricated example payload. The gateway authenticates the student and preserves a private session snapshot for later review.'},
  {id:'06-first-answer',seconds:35,title:'A saved answer and transparent feedback',narration:'For a reproducible demonstration, the recorder enters a sample answer derived from the question bank. This is a scripted sample, not a real student assessment. Submitting saves the answer and displays its transparent rubric. The score measures lexical concept coverage and an answer-length proxy. It is a practice aid and cannot reliably judge factual correctness or paraphrasing.'},
  {id:'07-feedback',seconds:35,title:'Complete the interview and review the evidence',narration:'The remaining four answers are submitted through the same real interface. Completing the fifth answer finishes the interview and opens review. The student answer appears beside its source reference, missing concepts, and follow-up. Interview history remains saved. The inspectable workflow records retrieval, exact-five selection, and a bounded template study plan.'},
  {id:'08-library',seconds:25,title:'Practice library and saved questions',narration:'The practice library supports role, topic, difficulty, completed, and bookmark filters. Here we inspect an actual question and reveal its cited reference answer. A bookmark is saved to the current account. Students can also select five questions to create a personal practice set. The catalog advertises only the topics supported by the imported sources.'},
  {id:'09-analytics',seconds:25,title:'Progress from real saved activity',narration:'Analytics now reflects the interview completed in this recording. One completed interview and five saved answers drive the counts and chart. Topic results and practice recommendations are computed from those records. A report can be exported, and a student may delete a saved session. These are demonstration rubric scores, rather than validated exam grades.'},
  {id:'10-retrieval',seconds:25,title:'A cited answer and an honest failure case',narration:'A closure question retrieves a reference from the public bank, with an inspectable citation and trace. We then ask about photosynthesis and orchids, which the source does not cover. The application returns the explicit knowledge-base fallback with no invented citation. Missing evidence does not become a confident generated answer.'},
  {id:'11-local-model',seconds:25,title:'Actual local SLM evidence',narration:'This panel shows a local model test executed during this recording. The model, fixed prompt, actual response and latency come from the authenticated API. Inference uses no paid provider or Ollama service. Default demonstration scoring and local model output remain distinguishable. Setup, tests, attribution and API evidence accompany the project.'},
];
const totalSeconds=chapters.reduce((n,c)=>n+c.seconds,0);
if(totalSeconds!==300)throw new Error('Demonstration chapter timings must total exactly 300 seconds.');
const narrationManifest=path.join(runtime,'narration.json');
await writeFile(narrationManifest,JSON.stringify({chapters},null,2),'utf8');
let ffmpeg;
if(!dryRun){
  ffmpeg=process.env.DEMO_FFMPEG??execFileSync('uv',['run','--no-project','--with','imageio-ffmpeg==0.6.0','python','-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts','demo-narrate.ps1'),'-ManifestPath',narrationManifest,'-OutputDirectory',runtime],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const c of chapters){
    const metadata=spawnSync(ffmpeg,['-hide_banner','-i',path.join(runtime,c.id+'.wav')],{encoding:'utf8',windowsHide:true}).stderr;
    const duration=metadata.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if(!duration)throw new Error(`Cannot verify narration duration for ${c.id}.`);
    const seconds=Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]);
    if(seconds>c.seconds-0.25)throw new Error(`Narration for ${c.id} exceeds its chapter; shorten its text rather than cutting off speech.`);
  }
}

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:runtime,size:{width:1600,height:1000}},reducedMotion:'reduce'});
const page=await context.newPage();
page.setDefaultTimeout(25000);
const runtimeErrors=[];
page.on('pageerror',error=>runtimeErrors.push(error.message));
const video=page.video();
const start=performance.now();
const events=[];
let currentSession;
let modelResult;
let currentQuestionIds=[];

async function api(endpoint,body){
  return page.evaluate(async({endpoint,body})=>{
    const token=localStorage.getItem('placement_ai_token');
    const response=await fetch('/api'+endpoint,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!response.ok)throw new Error(`API returned ${response.status}`);
    return response.json();
  },{endpoint,body});
}
async function nav(name){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name,exact:true}).click();}
async function holdUntil(seconds){
  const remaining=start+seconds*1000-performance.now();
  if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
}
async function evidencePanel(title,subtitle,value){
  await page.setContent('<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0;background:#0b1020;color:#e9eef9;font-family:Arial,sans-serif;padding:54px 65px}small{color:#9e86d8;letter-spacing:2px}h1{font-size:34px;margin:16px 0}p{color:#9aaac2;line-height:1.8;font-size:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:16px;padding:28px;background:#151c32;border:1px solid #a98bff30;border-radius:16px;max-height:690px;overflow:auto}.footer{font-size:13px;color:#68828f;margin-top:18px}</style></head><body><small>PLACEMENT AI / ACTUAL EXECUTION EVIDENCE</small><h1></h1><p></p><pre></pre><div class="footer">Captured from the real application during this recording. Authentication tokens are omitted.</div></body></html>');
  await page.evaluate(({title,subtitle,value})=>{document.querySelector('h1').textContent=title;document.querySelector('p').textContent=subtitle;document.querySelector('pre').textContent=JSON.stringify(value,null,2)}, {title,subtitle,value});
}
async function savedSession(){const id=await page.evaluate(()=>localStorage.getItem('placement_ai_session'));if(!id)throw new Error('No active interview ID saved by the UI.');return api('/interviews/'+id);}
async function submitSample(index){
  const question=currentSession.questions[index];
  // Deliberately identified as a scripted source-derived sample in the narration.
  await page.getByRole('textbox',{name:'Your interview answer'}).fill(question.answer.slice(0,1100));
  await page.getByRole('button',{name:'Submit answer',exact:true}).click();
  await expect(page.getByText('Your saved answer',{exact:true})).toBeVisible();
  currentSession=await savedSession();
}
let deadline=0;
async function chapter(index,action){
  const c=chapters[index];
  console.log(`Recording chapter ${index+1}/${chapters.length}: ${c.title}`);
  const began=(performance.now()-start)/1000;
  await action();
  events.push({chapter:c.id,actual_action_start_seconds:Math.round(began*1000)/1000,actual_action_end_seconds:Math.round((performance.now()-start))/1000});
  deadline+=dryRun?3:c.seconds;
  await holdUntil(deadline);
}
let rawPath;
try{
  await chapter(0,async()=>{await page.goto(base);await expect(page.getByRole('button',{name:'Explore demo workspace'})).toBeVisible();});
  await chapter(1,async()=>{await page.getByRole('button',{name:'Explore demo workspace'}).click();await expect(page.getByRole('heading',{name:'Welcome back, Student.'})).toBeVisible();await expect(page.getByText('Your story starts with one session')).toBeVisible();});
  await chapter(2,async()=>{await nav('Knowledge Base');await page.locator('.source-name').first().click();await expect(page.getByRole('dialog',{name:'Source details'})).toBeVisible();});
  await chapter(3,async()=>{
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();await nav('AI Interview');
    await page.getByRole('button',{name:'Set up your interview'}).click();
    await page.getByRole('dialog').getByLabel('Your target role').selectOption('React Developer');
    await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Your interview room'})).toBeVisible();
    currentSession=await savedSession();currentQuestionIds=currentSession.questions.map(q=>q.id);
    if(currentQuestionIds.length!==5||new Set(currentQuestionIds).size!==5)throw new Error('Interview did not contain exactly five distinct questions.');
    await page.getByRole('button',{name:'Start voice interview',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Start a conversational interview'})).toBeVisible();
    await page.getByRole('button',{name:'Keep typing',exact:true}).click();
  });
  await chapter(4,async()=>{
    const contract={role:currentSession.role,mode:currentSession.mode,question_count:currentSession.questions.length,questions:currentSession.questions.map(q=>({id:q.id,question:q.question,reference_answer:q.answer.slice(0,430),follow_up:q.follow_up,source:q.source}))};
    await evidencePanel('Exactly five questions, answers and follow-ups','Actual POST /api/interviews response, condensed for on-screen reading.',contract);
    if(!dryRun){await holdUntil(117);await page.locator('pre').evaluate(el=>el.scrollTo({top:el.scrollHeight,behavior:'smooth'}));}
  });
  await chapter(5,async()=>{await page.goto(base+'/?demo_resume=1#interview');await expect(page.getByRole('textbox',{name:'Your interview answer'})).toBeVisible();await submitSample(0);});
  await chapter(6,async()=>{
    for(let i=1;i<5;i++){await page.getByRole('button',{name:'Next question',exact:true}).click();await submitSample(i)}
    await page.getByRole('button',{name:'Finish & review',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Good practice. Better perspective.'})).toBeVisible();
    currentSession=await savedSession();
    if(currentSession.status!=='completed'||currentSession.turns.length!==5)throw new Error('Interview completion did not persist five answers.');
  });
  await chapter(7,async()=>{
    await nav('Practice Library');await page.getByRole('button',{name:'Question bank',exact:true}).click();
    await expect(page.locator('.question-row').first()).toBeVisible();
    await page.locator('.question-row').first().getByRole('button',{name:'Bookmark question',exact:true}).click();
    await page.locator('.question-main').first().click();
    await page.getByRole('button',{name:'Reveal reference answer',exact:true}).click();
    await expect(page.locator('.reference-card')).toBeVisible();
  });
  await chapter(8,async()=>{
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();await nav('Progress Analytics');
    await expect(page.locator('.analytics-stats .stat-card').nth(1).locator('.stat-value')).toHaveText('1');
    await expect(page.locator('.analytics-stats .stat-card').nth(2).locator('.stat-value')).toHaveText('5');
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export report'}).click();
    await (await downloadPromise).saveAs(path.join(runtime,'actual-demo-progress.csv'));
  });
  await chapter(9,async()=>{
    await nav('Knowledge Base');await page.getByRole('textbox',{name:'Ask the knowledge base',exact:true}).fill('What are JavaScript closures?');await page.getByRole('button',{name:'Ask',exact:true}).click();
    await expect(page.getByRole('heading',{name:'An answer with a source'})).toBeVisible();
    if(!dryRun)await holdUntil(264);
    await page.getByRole('textbox',{name:'Knowledge query',exact:true}).fill('Explain photosynthesis chloroplasts in orchids');await page.getByRole('button',{name:'Retrieve answer'}).click();
    await expect(page.getByText('Not found in the interview knowledge base',{exact:true})).toBeVisible();
  });
  await chapter(10,async()=>{
    const model=await api('/model/status').catch(()=>({status:'unavailable'}));
    if(model.status==='ready'){
      modelResult=await api('/model/test',{});
      if(modelResult.mode!=='local_slm'||!modelResult.response)throw new Error('Model test did not return actual local_slm output.');
      await evidencePanel('Actual local SLM response','Authenticated POST /api/model/test executed during this recording.',modelResult);
    }else if(dryRun){await evidencePanel('Dry-run: local model not ready','This automation check makes no model-completion claim.',model)}
    else throw new Error('The local SLM became unavailable before its demonstration.');
  });
  if(runtimeErrors.length)throw new Error('Browser runtime errors: '+runtimeErrors.join('; '));
  if(!dryRun&&(performance.now()-start)/1000>302)throw new Error('Actions overran the five-minute timeline; inspect timing manifest and re-record rather than truncate model evidence.');
}finally{
  await context.close();rawPath=await video.path();await browser.close();
}
const manifest={recorded_at:new Date().toISOString(),automated_recording:true,dry_run:dryRun,base_url:base,planned_duration_seconds:dryRun?null:300,actual_action_events:events,verified_bank_records:verified.catalog.question_count,verified_bank_chunks:chunks,question_ids:currentQuestionIds,completed_answers:currentSession?.turns?.length,model_test:modelResult??null,microphone_hardware_tested:false,live_speech_recognition_tested:false,runtime_errors:runtimeErrors};
if(dryRun){await writeFile(path.join(runtime,'dry-run-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Browser automation dry-run passed; no final demo artifact or completion claim was published.');process.exit(0)}

function timestamp(seconds,separator=','){const ms=Math.round(seconds*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${separator}${String(ms%1000).padStart(3,'0')}`}
let offset=0;
const subtitles=chapters.map((c,i)=>{const entry=`${i+1}\n${timestamp(offset)} --> ${timestamp(offset+c.seconds)}\n${c.title}\n`;offset+=c.seconds;return entry}).join('\n');
const subtitlePath=path.join(runtime,'chapters.srt');await writeFile(subtitlePath,subtitles,'utf8');
const inputs=['-i',rawPath];
for(const c of chapters)inputs.push('-i',path.join(runtime,c.id+'.wav'));
inputs.push('-i',subtitlePath);
const filters=chapters.map((c,i)=>`[${i+1}:a]apad,atrim=duration=${c.seconds},asetpts=PTS-STARTPTS[a${i}]`);
filters.push(chapters.map((_,i)=>`[a${i}]`).join('')+`concat=n=${chapters.length}:v=0:a=1[narration]`);
filters.push('[0:v]tpad=stop_mode=clone:stop_duration=4,trim=duration=300,setpts=PTS-STARTPTS[screen]');
const mp4=path.join(output,'Placement-AI-five-minute-demo.mp4');
const args=['-hide_banner','-y',...inputs,'-filter_complex',filters.join(';'),'-map','[screen]','-map','[narration]','-map',`${chapters.length+1}:s:0`,'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-c:s','mov_text','-t','300','-movflags','+faststart','-metadata','title=Placement AI — five-minute automated application demonstration',mp4];
await new Promise((resolve,reject)=>{const child=spawn(ffmpeg,args,{cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe']});let errors='';child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-8000)});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Video assembly failed: '+errors)))});
const probe=spawn(ffmpeg,['-hide_banner','-i',mp4],{windowsHide:true,stdio:['ignore','ignore','pipe']});let probeText='';probe.stderr.on('data',data=>probeText+=data);await new Promise(resolve=>probe.on('close',resolve));
const duration=probeText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
if(!duration)throw new Error('Could not verify demo video duration.');
const durationSeconds=Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3]);
if(Math.abs(durationSeconds-300)>0.15||!probeText.includes('Audio: aac')||!probeText.includes('Video: h264'))throw new Error('Final video must contain five-minute H.264 screen recording and AAC narration.');
manifest.actual_duration_seconds=durationSeconds;manifest.video_bytes=(await stat(mp4)).size;manifest.video_codec='h264';manifest.audio_codec='aac';manifest.narration='Offline Windows SAPI synthetic voice';
await writeFile(path.join(output,'recording-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await copyFile(subtitlePath,path.join(output,'chapters.srt'));
const transcript='# Placement AI — recorded five-minute demonstration\n\nThis is an automated recording of actual browser/API actions, with offline synthesized narration. It is not a recording of a person presenting. Microphone hardware and live speech recognition were not tested.\n\n'+chapters.map(c=>`## ${c.title}\n\n${c.narration}\n`).join('\n');
await writeFile(path.join(output,'transcript.md'),transcript,'utf8');
console.log(JSON.stringify({video:path.relative(root,mp4),seconds:durationSeconds,bytes:manifest.video_bytes,completed_answers:manifest.completed_answers,model_mode:modelResult.mode,narration:manifest.narration},null,2));
