import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back, Student.'})).toBeVisible();
});

test('all six screens render actual data and an empty account has no invented progress',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.getByText('No practice scores yet')).toBeVisible();
  await page.screenshot({path:'../docs/screenshots/01-overview.png',fullPage:true});
  const screens=[['AI Interview','AI interview'],['Practice Library','Practice library'],['Feedback & Analytics','Feedback & review'],['Resume Mock','Resume Mock'],['Knowledge Base','Knowledge base']];
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link')).toHaveCount(6);
  for(const [label,title] of screens){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:label,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();if(label==='Practice Library'){await expect(page.locator('.library-card').first()).toBeVisible();await page.screenshot({path:'../docs/screenshots/03-library.png',fullPage:true})}}
  await expect(page.getByRole('textbox',{name:'Ask the knowledge base'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Source library'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Source library'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Import a source'})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a full five-question interview persists feedback and real analytics',async({page})=>{
  test.setTimeout(240000); // Each answer may also wait for bounded CPU inference.
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your interview room',exact:true})).toBeVisible();
  await page.screenshot({path:'../docs/screenshots/02-interview.png',fullPage:true});
  for(let i=0;i<5;i++){
    const answer=page.getByRole('textbox',{name:'Your interview answer'});
    await answer.fill('I would explain the concept with a concrete example, then discuss scope, asynchronous callbacks, state and browser behavior, checking the reference for the exact source concepts.');
    await page.getByRole('button',{name:'Submit answer',exact:true}).click();
    await expect(page.getByText('Your saved answer',{exact:true})).toBeVisible({timeout:50000});
    if(i<4)await page.getByRole('button',{name:'Next question',exact:true}).click();
    else await page.getByRole('button',{name:'Finish & review',exact:true}).click();
  }
  await expect(page.getByRole('heading',{name:'Feedback & review',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Reference answer',exact:true})).toBeVisible();
  await page.screenshot({path:'../docs/screenshots/04-feedback.png',fullPage:true});
  await page.getByRole('button',{name:'Analytics',exact:true}).click();
  await expect(page.getByText('Completed interviews',{exact:true})).toBeVisible();
  await expect(page.locator('.analytics-stats .stat-card').nth(1).locator('.stat-value')).toHaveText('1');
  await expect(page.locator('.analytics-stats .stat-card').nth(2).locator('.stat-value')).toHaveText('5');
  await page.screenshot({path:'../docs/screenshots/05-analytics.png',fullPage:true});
  await page.reload();await expect(page.locator('.analytics-stats .stat-card').nth(2).locator('.stat-value')).toHaveText('5');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export report'}).click();expect((await download).suggestedFilename()).toBe('placement-ai-progress.csv');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.history-row').first().getByRole('button',{name:/Delete interview/}).click();
  await expect(page.locator('.analytics-stats .stat-card').nth(2).locator('.stat-value')).toHaveText('0');
  await page.getByRole('button',{name:'Feedback',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No recorded practice'})).toBeVisible();
});

test('interview setup offers workable theory topics and starts Full Stack Security',async({page})=>{
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();
  const dialog=page.getByRole('dialog');
  const role=dialog.getByLabel('Your target role');
  const topic=dialog.getByLabel('Focus topic');
  await role.selectOption('Python Developer');
  await expect(topic.locator('option')).toHaveText(['A balanced mix','Python']);
  await role.selectOption('Full Stack Developer');
  await topic.selectOption('Security');
  await expect(dialog.getByLabel('Difficulty').locator('option')).toHaveText(['Mixed difficulty']);
  const planned=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/interviews'));
  await dialog.getByRole('button',{name:'Start interview',exact:true}).click();
  const response=await planned;
  expect(response.status()).toBe(201);
  const session=await response.json();
  expect(session.questions).toHaveLength(5);
  expect(new Set(session.questions.map((q:{id:string})=>q.id)).size).toBe(5);
  expect(session.questions.every((q:{topic:string;follow_up:string})=>q.topic==='Security'&&q.follow_up)).toBe(true);
  await expect(page.locator('.stage-count')).toHaveText('Question 1 / 5');
});

test('an older session with a retired exercise opens the new theory interview prompt',async({page})=>{
  await page.getByRole('button',{name:'Start an interview',exact:true}).click();
  const planned=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/interviews'));
  await page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true}).click();
  const session=await (await planned).json();
  await expect(page.getByRole('heading',{name:'Your interview room'})).toBeVisible();
  session.questions[0]={...session.questions[0],id:'batches',question:'Create a function to count recipe batches.'};
  await page.route('**/api/interviews',route=>route.request().method()==='GET'
    ? route.fulfill({json:[session]})
    : route.continue());
  await page.reload();
  await expect(page.getByRole('heading',{name:'Start a theory interview'})).toBeVisible();
  await expect(page.getByText('Create a function to count recipe batches.')).toHaveCount(0);
  await page.getByRole('button',{name:'Start a theory interview'}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Start interview',exact:true})).toBeEnabled();
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
  await expect(page.getByText('Your saved answer',{exact:true})).toBeVisible({timeout:50000});
});

test('mobile navigation and main screens avoid horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  for(const [label,title] of [['Practice Library','Practice library'],['AI Interview','AI interview'],['Knowledge Base','Knowledge base'],['Overview','Welcome back, Student.']]){
    await page.getByRole('button',{name:'Open navigation'}).click();
    await page.getByRole('navigation').getByRole('link',{name:label,exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(page.locator('.sidebar')).not.toBeInViewport();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    if(label==='Knowledge Base'){
      await page.getByRole('link',{name:'Skip to content'}).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#page-start')).toBeFocused();
      await expect(page).toHaveURL(/#knowledge$/);
    }
  }
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  await expect(page.getByRole('button',{name:'Open navigation'})).toBeFocused();
  await page.screenshot({path:'../docs/screenshots/07-mobile.png',fullPage:true});
  await page.setViewportSize({width:768,height:1024});
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Knowledge Base',exact:true}).click();
  await expect(page.getByRole('button',{name:'Agent workspace',exact:true})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
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
