import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');await page.getByRole('button',{name:'Explore demo workspace'}).click();await expect(page.getByRole('heading',{name:'Welcome back, Student.'})).toBeVisible()});

test('a request for help is explained and never graded or advanced',async({page})=>{
  test.slow();
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  await page.getByRole('textbox',{name:'Your interview answer'}).fill("I don't know exactly about ARIA. Can you help me understand that?");
  await expect(page.getByText(/This looks like a request for help/)).toBeVisible();
  await page.getByRole('button',{name:'Ask Ava instead',exact:true}).click();
  await expect(page.locator('.conversation-message.assistant')).toHaveCount(1,{timeout:65000});
  await expect(page.locator('.conversation-message.assistant p')).toContainText(/ARIA|accessible|assistive/i);
  await expect(page.getByText('Your saved answer',{exact:true})).toHaveCount(0);
  await expect(page.locator('.stage-count')).toHaveText('Question 1 / 5');
  await page.getByRole('textbox',{name:'Ask Ava about this question'}).fill('Can you give me a simple example of that?');
  await page.getByRole('button',{name:'Ask Ava',exact:true}).click();
  await expect(page.locator('.conversation-message.assistant')).toHaveCount(2,{timeout:65000});
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo({top:0,behavior:'instant'})});
  await page.screenshot({path:'../docs/screenshots/08-contextual-tutoring.png',fullPage:true,animations:'disabled'});
  await page.reload();await page.getByRole('navigation').getByRole('link',{name:'AI Interview',exact:true}).click();
  await expect(page.locator('.conversation-message.assistant')).toHaveCount(2);
});

test('personal documents produce requested notes and questions without admin permission',async({page})=>{
  test.slow();
  await page.getByRole('navigation').getByRole('link',{name:'Knowledge Base',exact:true}).click();
  await page.getByRole('button',{name:'Upload study document',exact:true}).click();
  await page.getByLabel('Upload study document file').setInputFiles({name:'transactions.txt',mimeType:'text/plain',buffer:Buffer.from('Database transactions have ACID properties. Atomicity means all changes commit together or roll back together. Consistency preserves database rules. Isolation separates concurrent transactions. Durability means committed changes survive a restart.')});
  await page.getByLabel('Title (optional)').fill('My transaction lesson');
  await page.getByRole('button',{name:'Upload private document',exact:true}).click();
  await expect(page.getByRole('heading',{name:'My transaction lesson',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Study material request'}).fill('Explain atomicity in simple language with a short example.');
  await page.getByRole('button',{name:'Generate notes',exact:true}).click();
  await expect(page.locator('.study-summary')).toContainText(/atomic|transaction|changes/i,{timeout:65000});
  await page.getByRole('button',{name:'Create practice questions',exact:true}).click();
  await page.getByLabel('Study question count').selectOption('2');
  await page.getByRole('textbox',{name:'Study material request'}).fill('Make two questions about atomicity and durability.');
  await page.getByRole('button',{name:'Generate questions',exact:true}).click();
  await expect(page.locator('.study-question')).toHaveCount(2,{timeout:65000});
  await page.locator('.study-citations summary').click();
  await expect(page.locator('.study-citations')).toContainText('Text, passage 1');
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo({top:0,behavior:'instant'})});
  await page.screenshot({path:'../docs/screenshots/09-personal-study-documents.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'../docs/screenshots/10-personal-study-mobile.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.md$/);
  await page.reload();await page.getByRole('button',{name:'My study documents',exact:true}).click();await page.getByRole('button',{name:/My transaction lesson/}).first().click();
  await expect(page.getByRole('heading',{name:'Saved study materials'})).toBeVisible();
});

test('voice conversation sends final transcript once and speaks the assistant reply',async({page})=>{
  await page.addInitScript(()=>{
    const spoken:string[]=[];(window as unknown as {spoken:string[]}).spoken=spoken;
    class Utterance {text:string;voice=null;lang='en-US';rate=1;onstart:(()=>void)|null=null;onend:(()=>void)|null=null;onerror:(()=>void)|null=null;constructor(text:string){this.text=text}}
    Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:Utterance});
    const fakeVoice={lang:'en-US',localService:true,name:'Test voice'};
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[fakeVoice],cancel(){},addEventListener(){},removeEventListener(){},speak(utterance:SpeechSynthesisUtterance){spoken.push(utterance.text);utterance.onstart?.({} as SpeechSynthesisEvent);setTimeout(()=>utterance.onend?.({} as SpeechSynthesisEvent),5)}}});
    let round=0;
    class Recognition{continuous=false;interimResults=false;lang='';onresult:((e:unknown)=>void)|null=null;onend:(()=>void)|null=null;onerror:((e:unknown)=>void)|null=null;start(){if(round++)return;setTimeout(()=>{this.onresult?.({results:[{isFinal:true,0:{transcript:'Please explain this question simply'}}]});this.onend?.();this.onend?.()},10)}stop(){this.onend?.()}abort(){}}
    Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:Recognition});
  });
  await page.reload();
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  let calls=0;
  await page.route('**/api/interviews/*/chat',async route=>{calls++;const b=route.request().postDataJSON();const reply={id:'assistant',question_id:b.question_id,role:'assistant',content:'ARIA adds accessibility information for assistive technology.',created_at:new Date().toISOString(),mode:'demo'};await route.fulfill({json:{messages:[reply],reply}})});
  await page.getByRole('button',{name:'Ask with voice',exact:true}).click();await page.getByRole('button',{name:'Allow & start voice conversation',exact:true}).click();
  await expect(page.locator('.conversation-message.assistant')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {spoken:string[]}).spoken.some(t=>t.includes('accessibility information')))).toBe(true);
  expect(calls).toBe(1);
  await page.getByRole('button',{name:'Stop voice conversation',exact:true}).click();
  await expect(page.getByText(/Listening for your cross-question/)).toHaveCount(0);
});

test('Piper audio plays when the browser has no installed speech voice',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],cancel(){},addEventListener(){},removeEventListener(){}}}));
  await page.reload();await page.getByRole('button',{name:'Start an interview',exact:true}).click();
  const audio=page.waitForResponse(r=>r.url().endsWith('/api/voice/speech'));
  await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  await expect(page.getByRole('button',{name:'Spoken replies on',exact:true})).toBeVisible();
  const response=await audio;expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('audio/wav');expect((await response.body()).toString('ascii',0,4)).toBe('RIFF');
  await expect(page.getByText('AVA IS SPEAKING',{exact:true})).toBeVisible();
  await expect(page.getByText('AVA IS SPEAKING',{exact:true})).toHaveCount(0,{timeout:20000});
  await expect(page.getByRole('alert')).toHaveCount(0);
});
