import {test,expect,type Page} from '@playwright/test';
import type {ChatMessage,Session} from '../src/types';

const FOLLOW_UP='How would you choose between native HTML and an ARIA role?';
const FOLLOW_UP_REPLY='Native HTML provides built-in semantics. Use an ARIA role when a native element cannot represent the interaction.';

interface DialogueHarness {
  spoken:string[];
  recognitionStarts:number;
  endSpeech:()=>void;
  emitCandidate:(text:string)=>void;
  lateCancelledSpeechEnd:()=>void;
}

async function installVoiceHarness(page:Page){
  await page.addInitScript(()=>{
    type Handler=(()=>void)|null;
    class Utterance {
      text:string;voice=null;lang='en-US';rate=1;onstart:Handler=null;onend:Handler=null;onerror:Handler=null;
      constructor(text:string){this.text=text}
    }
    let pending:Utterance|null=null,cancelled:Utterance|null=null,active:Recognition|null=null;
    const state={
      spoken:[] as string[],recognitionStarts:0,
      endSpeech(){const current=pending;pending=null;current?.onend?.()},
      emitCandidate(text:string){
        if(!active)throw new Error('The interviewer has not handed the microphone to the candidate.');
        const current=active;
        current.onresult?.({results:[{isFinal:true,0:{transcript:text}}]});
        current.onend?.();
        // Some browser recognition implementations repeat their final end event.
        current.onend?.();
      },
      lateCancelledSpeechEnd(){cancelled?.onend?.()},
    };
    class Recognition {
      continuous=false;interimResults=false;lang='';
      onresult:((event:{results:{isFinal:boolean;0:{transcript:string}}[]})=>void)|null=null;
      onend:Handler=null;onerror:((event:{error:string})=>void)|null=null;
      start(){active=this;state.recognitionStarts++}
      stop(){if(active===this)active=null;this.onend?.()}
      abort(){if(active===this)active=null;this.onend?.()}
    }
    Object.defineProperty(window,'dialogueVoice',{configurable:true,value:state});
    Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:Recognition});
    Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:Utterance});
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      getVoices:()=>[{name:'Controllable test voice',lang:'en-US',localService:true}],
      addEventListener(){},removeEventListener(){},
      cancel(){if(pending)cancelled=pending;pending=null},
      speak(utterance:Utterance){pending=utterance;state.spoken.push(utterance.text);utterance.onstart?.()},
    }});
  });
}

async function spoken(page:Page){return page.evaluate(()=>(window as unknown as {dialogueVoice:DialogueHarness}).dialogueVoice.spoken)}
async function endSpeech(page:Page){await page.evaluate(()=>(window as unknown as {dialogueVoice:DialogueHarness}).dialogueVoice.endSpeech())}
async function say(page:Page,text:string){await page.evaluate(value=>(window as unknown as {dialogueVoice:DialogueHarness}).dialogueVoice.emitCandidate(value),text)}
async function recognitionStarts(page:Page){return page.evaluate(()=>(window as unknown as {dialogueVoice:DialogueHarness}).dialogueVoice.recognitionStarts)}
const normalize=(value:string)=>value.replace(/[*#`]/g,'').replace(/\s+/g,' ').trim();

async function startInterview(page:Page){
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/interviews'));
  await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  const session=await (await response).json() as Session;
  await expect(page.getByRole('heading',{name:'Your interview room',exact:true})).toBeVisible();
  return session;
}

async function beginVoiceInterview(page:Page,session:Session){
  await page.getByRole('button',{name:'Start voice interview',exact:true}).click();
  await page.getByRole('button',{name:'Allow & start voice interview',exact:true}).click();
  await expect.poll(async()=>normalize((await spoken(page)).at(-1)??'')).toContain(normalize(session.questions[0].question));
  await endSpeech(page);
  await expect.poll(()=>recognitionStarts(page)).toBe(1);
}

function chatResult(session:Session,text:string,content:string){
  const created_at=new Date().toISOString(),question_id=session.questions[0].id;
  const user:ChatMessage={id:'mock-candidate',question_id,role:'user',content:text,created_at,mode:'user'};
  const reply:ChatMessage={id:'mock-interviewer',question_id,role:'assistant',content,created_at,mode:'demo',source:session.questions[0].source};
  return {messages:[user,reply],reply};
}

test.beforeEach(async({page})=>{
  await installVoiceHarness(page);
  await page.goto('/');
  await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back, Student.'})).toBeVisible();
});

test('mocked voice interview speaks visible feedback then accepts a follow-up without grading it twice',async({page})=>{
  const session=await startInterview(page),question=session.questions[0];
  await expect(page.getByRole('button',{name:'Spoken replies on',exact:true})).toBeVisible();
  let answers=0,chats=0;
  await page.route('**/api/interviews/*/answers',async route=>{
    answers++;
    const body=route.request().postDataJSON();
    expect(body.question_id).toBe(question.id);
    await route.fulfill({json:{...session,turns:[{question_id:question.id,answer:body.answer,answered_at:new Date().toISOString(),evaluation:{score:55,accuracy:50,completeness:50,clarity:80,matched_concepts:['assistive technologies'],missing_concepts:['native HTML'],feedback:['Mention when native HTML already supplies the required semantics.'],follow_up:FOLLOW_UP,follow_up_mode:'demo',mode:'demo',source:question.source}}]}});
  });
  await page.route('**/api/interviews/*/chat',async route=>{
    chats++;
    const body=route.request().postDataJSON();
    expect(body.question_id).toBe(question.id);
    expect(body.message).toContain('I would first use a native HTML element');
    await route.fulfill({json:chatResult(session,body.message,FOLLOW_UP_REPLY)});
  });
  await beginVoiceInterview(page,session);
  await say(page,'ARIA adds roles and properties for assistive technologies to understand custom controls.');
  await expect(page.getByText('Your saved answer',{exact:true})).toBeVisible();
  const visibleReply=page.getByTestId('interviewer-reply').last();
  await expect(visibleReply).toContainText(FOLLOW_UP);
  await expect.poll(async()=>normalize((await spoken(page)).at(-1)??'')).toBe(normalize(await visibleReply.innerText()));
  await endSpeech(page);
  await expect.poll(()=>recognitionStarts(page)).toBe(2);
  await say(page,'I would first use a native HTML element when its built-in semantics are suitable.');
  await expect(page.locator('.conversation-message.assistant p')).toHaveText(FOLLOW_UP_REPLY);
  await expect.poll(async()=>(await spoken(page)).at(-1)).toBe(FOLLOW_UP_REPLY);
  expect(answers).toBe(1);expect(chats).toBe(1);
  await endSpeech(page);
  await expect.poll(()=>recognitionStarts(page)).toBe(3);
  await say(page,'next question');
  await expect(page.locator('.stage-count')).toHaveText('Question 2 / 5');
  await expect.poll(async()=>normalize((await spoken(page)).at(-1)??'')).toContain(normalize(session.questions[1].question));
  expect(answers).toBe(1);expect(chats).toBe(1);
  await page.getByRole('button',{name:'Stop voice interview',exact:true}).click();
});

for(const action of ['Stop voice interview','Pause interview']){
  test(`mocked ${action.toLowerCase()} prevents delayed replies from speaking or restarting capture`,async({page})=>{
    const session=await startInterview(page);
    let release:()=>void=()=>{},requested:()=>void=()=>{},finished:()=>void=()=>{};
    const requestStarted=new Promise<void>(resolve=>{requested=resolve});
    const responseFinished=new Promise<void>(resolve=>{finished=resolve});
    await page.route('**/api/interviews/*/chat',async route=>{
      requested();await new Promise<void>(resolve=>{release=resolve});
      try{await route.fulfill({json:chatResult(session,"I don't understand. Please explain.",'This delayed reply must remain silent after stopping.')})}catch{/* Stop may already have aborted the intercepted request. */}finally{finished()}
    });
    await beginVoiceInterview(page,session);
    await say(page,"I don't understand. Please explain.");
    await requestStarted;
    const spokenBefore=(await spoken(page)).length,startsBefore=await recognitionStarts(page);
    await page.getByRole('button',{name:action,exact:true}).click();
    release();await responseFinished;
    await page.evaluate(()=>(window as unknown as {dialogueVoice:DialogueHarness}).dialogueVoice.lateCancelledSpeechEnd());
    // Give the cancelled fetch and stale speech-end callbacks a chance to run.
    await page.waitForTimeout(150);
    expect((await spoken(page)).length).toBe(spokenBefore);
    expect(await recognitionStarts(page)).toBe(startsBefore);
    if(action==='Pause interview')await expect(page.getByRole('button',{name:'Resume interview',exact:true})).toBeVisible();
  });
}

test('mocked typed candidate cross-question is displayed and spoken without opening the microphone',async({page})=>{
  const session=await startInterview(page),reply='ARIA supplies accessibility roles, states and properties for custom controls.';
  await page.route('**/api/interviews/*/chat',async route=>{
    const body=route.request().postDataJSON();
    await route.fulfill({json:chatResult(session,body.message,reply)});
  });
  await page.getByRole('textbox',{name:'Ask Ava about this question'}).fill('Please explain ARIA simply.');
  await page.getByRole('button',{name:'Ask Ava',exact:true}).click();
  await expect(page.locator('.conversation-message.assistant p')).toHaveText(reply);
  await expect.poll(async()=>(await spoken(page)).at(-1)).toBe(reply);
  expect(await recognitionStarts(page)).toBe(0);
});
