import {test,expect,type Page} from '@playwright/test';

const REPLY='ARIA helps assistive technology interpret custom controls. '.repeat(45)+'This is the final sentence of the complete response.';
const PREFIX='ARIA helps assistive technology';

interface LifecycleHarness {
  spoken:string[];
  audioCount:number;
  recognitionStarts:number;
  resetPlayback:()=>void;
  emitCandidate:(text:string)=>void;
  endWithoutSpeech:()=>void;
  endBrowser:(index:number)=>void;
  endAudio:(index:number)=>void;
}

async function installHarness(page:Page,browserVoice:boolean){
  await page.addInitScript(({browserVoice})=>{
    type Handler=(()=>void)|null;
    class Utterance {
      text:string;voice=null;lang='en-US';rate=1;onstart:Handler=null;onend:Handler=null;onerror:Handler=null;
      constructor(text:string){this.text=text}
    }
    let active:Recognition|null=null;
    const utterances:Utterance[]=[],players:Player[]=[];
    const state={
      spoken:[] as string[],audioCount:0,recognitionStarts:0,
      resetPlayback(){state.spoken=[];utterances.length=0;players.length=0;state.audioCount=0},
      emitCandidate(text:string){const current=active;if(!current)throw new Error('No active recognition');current.onresult?.({results:[{isFinal:true,0:{transcript:text}}]});current.onend?.()},
      endWithoutSpeech(){active?.onend?.();active?.onend?.()},
      endBrowser(index:number){utterances[index]?.onend?.()},
      endAudio(index:number){players[index]?.onended?.()},
    };
    class Recognition {
      continuous=false;interimResults=false;lang='';onresult:((event:{results:{isFinal:boolean;0:{transcript:string}}[]})=>void)|null=null;onend:Handler=null;onerror:Handler=null;
      start(){active=this;state.recognitionStarts++}
      stop(){this.onend?.()}
      abort(){if(active===this)active=null}
    }
    class Player {
      src='';onplaying:Handler=null;onended:Handler=null;onerror:Handler=null;
      play(){players.push(this);state.audioCount++;this.onplaying?.();return Promise.resolve()}
      pause(){}
      removeAttribute(){}
    }
    Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:Utterance});
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      getVoices:()=>browserVoice?[{lang:'en-US',localService:true,name:'Lifecycle test voice'}]:[],
      addEventListener(){},removeEventListener(){},cancel(){},
      speak(utterance:Utterance){utterances.push(utterance);state.spoken.push(utterance.text);utterance.onstart?.()},
    }});
    Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:Recognition});
    Object.defineProperty(window,'Audio',{configurable:true,value:Player});
    (window as unknown as {voiceLifecycle:typeof state}).voiceLifecycle=state;
  },{browserVoice});
}

async function openVoiceConversation(page:Page,browserVoice=true){
  await installHarness(page,browserVoice);
  await page.goto('/');
  await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  await page.getByRole('button',{name:'Ask with voice',exact:true}).click();
  await page.getByRole('button',{name:'Allow & start voice conversation',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.recognitionStarts)).toBe(1);
  await page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.resetPlayback());
}

async function mockLongReply(page:Page){
  await page.route('**/api/interviews/*/chat',async route=>{
    const body=route.request().postDataJSON();
    const shared={question_id:body.question_id,created_at:new Date().toISOString()};
    const user={...shared,id:'candidate',role:'user',mode:'user',content:body.message};
    const reply={...shared,id:'interviewer',role:'assistant',mode:'demo',content:REPLY};
    await route.fulfill({json:{messages:[user,reply],reply}});
  });
}

async function askForReply(page:Page){
  await page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.emitCandidate('Please explain this question simply.'));
  await expect(page.locator('.conversation-message.assistant p')).toHaveText(REPLY);
}

test('browser speech reads the complete reply and resumes listening only once after the last chunk',async({page})=>{
  await mockLongReply(page);
  await openVoiceConversation(page);
  await askForReply(page);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.spoken.length)).toBe(1);
  await page.evaluate(()=>{const state=(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle;state.endBrowser(0);state.endBrowser(0)});
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.spoken.length)).toBe(2);
  expect(await page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.recognitionStarts)).toBe(1);
  const chunks=await page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.spoken);
  expect(chunks.every(chunk=>chunk.length<=1800)).toBe(true);
  expect(chunks.join('')).toBe(REPLY);
  await page.evaluate(()=>{const state=(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle;state.endBrowser(1);state.endBrowser(1)});
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.recognitionStarts)).toBe(2);
});

for(const stopEarly of [false,true]){
  test(`mocked Piper chunks ${stopEarly?'stop without playing the remainder or restarting capture':'play the whole text before restarting capture'}`,async({page})=>{
    const requests:string[]=[];
    await page.route('**/api/voice/speech',async route=>{
      const text=route.request().postDataJSON().text as string;
      if(text.startsWith(PREFIX)||requests.length)requests.push(text);
      await route.fulfill({contentType:'audio/wav',body:Buffer.from('RIFF mock WAV transport')});
    });
    await mockLongReply(page);
    await openVoiceConversation(page,false);
    await askForReply(page);
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.audioCount)).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests[0].length).toBeLessThanOrEqual(1800);
    if(stopEarly){
      await page.getByRole('button',{name:'Stop voice conversation',exact:true}).click();
      await page.evaluate(()=>{const state=(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle;state.endAudio(0);state.endAudio(0)});
      expect(requests).toHaveLength(1);
      expect(await page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.recognitionStarts)).toBe(1);
      await expect(page.locator('.conversation-message.assistant p')).toHaveText(REPLY);
    }else{
      await page.evaluate(()=>{const state=(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle;state.endAudio(0);state.endAudio(0)});
      await expect.poll(()=>page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.audioCount)).toBe(2);
      expect(await page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.recognitionStarts)).toBe(1);
      expect(requests.every(text=>text.length<=1800)).toBe(true);
      expect(requests.join('')).toBe(REPLY);
      await page.evaluate(()=>{const state=(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle;state.endAudio(1);state.endAudio(1)});
      await expect.poll(()=>page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.recognitionStarts)).toBe(2);
    }
  });
}

test('recognition ending without final words stops the voice conversation and explains typed fallback',async({page})=>{
  await openVoiceConversation(page);
  await page.evaluate(()=>(window as unknown as {voiceLifecycle:LifecycleHarness}).voiceLifecycle.endWithoutSpeech());
  await expect(page.getByRole('alert')).toContainText('No speech was detected');
  await expect(page.getByRole('button',{name:'Stop voice conversation',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Ask with voice',exact:true})).toBeEnabled();
  await expect(page.getByRole('textbox',{name:'Ask Ava about this question'})).toBeEnabled();
});
