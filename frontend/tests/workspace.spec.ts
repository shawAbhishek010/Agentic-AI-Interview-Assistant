import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back, Student.'})).toBeVisible();
});

test('all six screens render actual data and an empty account has no invented progress',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.getByText('Your story starts with one session')).toBeVisible();
  await page.screenshot({path:'../docs/screenshots/01-overview.png',fullPage:true});
  const screens=[['AI Interview','Meet your practice partner.'],['Practice Library','A little practice. A lot of possibility.'],['Feedback & Review','Good practice. Better perspective.'],['Progress Analytics','Small steps. Visible progress.'],['Knowledge Base','Knowledge you can trace.']];
  for(const [label,title] of screens){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:label,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();if(label==='Practice Library'){await expect(page.locator('.library-card').first()).toBeVisible();await page.screenshot({path:'../docs/screenshots/03-library.png',fullPage:true})}}
  await expect(page.getByText('30 seconds of interviews',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Import a source'})).toBeDisabled();
  expect(errors).toEqual([]);
});

test('a full five-question interview persists feedback and real analytics',async({page})=>{
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your interview room',exact:true})).toBeVisible();
  await page.screenshot({path:'../docs/screenshots/02-interview.png',fullPage:true});
  for(let i=0;i<5;i++){
    const answer=page.getByRole('textbox',{name:'Your interview answer'});
    await answer.fill('I would explain the concept with a concrete example, then discuss scope, asynchronous callbacks, state and browser behavior, checking the reference for the exact source concepts.');
    await page.getByRole('button',{name:'Submit answer',exact:true}).click();
    await expect(page.getByText('Your saved answer',{exact:true})).toBeVisible();
    if(i<4)await page.getByRole('button',{name:'Next question',exact:true}).click();
    else await page.getByRole('button',{name:'Finish & review',exact:true}).click();
  }
  await expect(page.getByRole('heading',{name:'Good practice. Better perspective.',exact:true})).toBeVisible();
  await expect(page.getByText('A source to learn from',{exact:true})).toBeVisible();
  await page.screenshot({path:'../docs/screenshots/04-feedback.png',fullPage:true});
  await page.getByRole('navigation').getByRole('link',{name:'Progress Analytics',exact:true}).click();
  await expect(page.getByText('Completed interviews',{exact:true})).toBeVisible();
  await expect(page.locator('.analytics-stats .stat-card').nth(1).locator('.stat-value')).toHaveText('1');
  await expect(page.locator('.analytics-stats .stat-card').nth(2).locator('.stat-value')).toHaveText('5');
  await page.screenshot({path:'../docs/screenshots/05-analytics.png',fullPage:true});
  await page.reload();await expect(page.locator('.analytics-stats .stat-card').nth(2).locator('.stat-value')).toHaveText('5');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export report'}).click();expect((await download).suggestedFilename()).toBe('placement-ai-progress.csv');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.history-row').first().getByRole('button',{name:/Delete interview/}).click();
  await expect(page.locator('.analytics-stats .stat-card').nth(2).locator('.stat-value')).toHaveText('0');
  await page.getByRole('navigation').getByRole('link',{name:'Feedback & Review',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your next insight starts with an answer'})).toBeVisible();
});

test('knowledge retrieval cites a real source and unsupported queries return no fabricated answer',async({page})=>{
  await page.getByRole('navigation').getByRole('link',{name:'Knowledge Base',exact:true}).click();
  await page.getByRole('textbox',{name:'Ask the knowledge base',exact:true}).fill('What are JavaScript closures?');
  await page.getByRole('button',{name:'Ask',exact:true}).click();
  await expect(page.getByRole('heading',{name:'An answer with a source'})).toBeVisible();
  await expect(page.locator('.rag-answer')).toContainText(/closure/i);
  await page.screenshot({path:'../docs/screenshots/06-knowledge.png',fullPage:true});
  await page.getByRole('textbox',{name:'Knowledge query',exact:true}).fill('Explain photosynthesis chloroplasts in orchids');
  await page.getByRole('button',{name:'Retrieve answer'}).click();
  await expect(page.getByText('Not found in the interview knowledge base',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'No citations to invent'})).toBeVisible();
});

test('bookmarks and five-question custom practice sets work',async({page})=>{
  await page.getByRole('navigation').getByRole('link',{name:'Practice Library',exact:true}).click();
  await page.getByLabel('Practice role',{exact:true}).selectOption('React Developer');
  await page.getByRole('button',{name:'Question bank',exact:true}).click();
  await expect(page.locator('.question-row').first()).toBeVisible();
  await page.locator('.question-row').first().getByRole('button',{name:'Bookmark question',exact:true}).click();
  await page.getByLabel('Filter saved or completed').selectOption('bookmarked');
  await expect(page.locator('.question-row')).toHaveCount(1);
  await page.getByLabel('Filter saved or completed').selectOption('all');
  for(let i=0;i<5;i++)await page.locator('.question-row').nth(i).getByRole('checkbox').check();
  await page.getByRole('button',{name:'Save practice set',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Set name').fill('My React foundations');
  await page.getByRole('button',{name:'Save set',exact:true}).click();
  await page.getByRole('button',{name:/My practice sets/}).click();
  await expect(page.getByRole('heading',{name:'My React foundations'})).toBeVisible();
  await page.getByRole('button',{name:'Start this set'}).click();
  await expect(page.getByRole('heading',{name:'Your interview room'})).toBeVisible();
});

test('microphone denial leaves a working typed-answer path',async({page})=>{
  await page.addInitScript(()=>{
    class DeniedRecognition{continuous=false;interimResults=false;lang='';onerror:((e:{error:string})=>void)|null=null;onend:(()=>void)|null=null;start(){setTimeout(()=>{this.onerror?.({error:'not-allowed'});this.onend?.()},0)}stop(){this.onend?.()}abort(){}}
    Object.defineProperty(window,'SpeechRecognition',{value:DeniedRecognition,configurable:true});
  });
  await page.reload();
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  await page.getByRole('button',{name:'Start voice interview',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Start a conversational interview'})).toBeVisible();
  await page.getByRole('button',{name:'Allow & start voice interview'}).click();
  await expect(page.getByText('Microphone access was denied. Type your answer below to continue.',{exact:true})).toBeVisible({timeout:20000});
  await page.getByRole('textbox',{name:'Your interview answer'}).fill('I can continue with a typed answer after denying microphone access.');
  await page.getByRole('button',{name:'Submit answer',exact:true}).click();
  await expect(page.getByText('Your saved answer',{exact:true})).toBeVisible();
});

test('mobile navigation and main screens avoid horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  for(const [label,title] of [['Practice Library','A little practice. A lot of possibility.'],['AI Interview','Meet your practice partner.'],['Knowledge Base','Knowledge you can trace.'],['Overview','Welcome back, Student.']]){
    await page.getByRole('button',{name:'Open navigation'}).click();
    await page.getByRole('navigation').getByRole('link',{name:label,exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(page.locator('.sidebar')).not.toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  await expect(page.getByRole('button',{name:'Open navigation'})).toBeFocused();
  await page.screenshot({path:'../docs/screenshots/07-mobile.png',fullPage:true});
});

test('speech playback failure is visible and typing remains available',async({page})=>{
  await page.route('**/api/voice/speech',route=>route.fulfill({status:503,json:{message:'Local voice unavailable for this test'}}));
  await page.addInitScript(()=>{
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},speak(utterance:SpeechSynthesisUtterance){setTimeout(()=>utterance.onerror?.({error:'synthesis-unavailable'} as SpeechSynthesisErrorEvent),0)}}});
  });
  await page.reload();
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  await page.getByRole('button',{name:'Read question aloud',exact:true}).click();
  await expect(page.getByText('Speech playback is unavailable. Read the question on screen and type your answer to continue.',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Your interview answer'}).fill('Typing is available even when speech playback cannot start.');
  await expect(page.getByRole('button',{name:'Submit answer',exact:true})).toBeEnabled();
});
