import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back, Student.'})).toBeVisible();
});

test('coding practice runs examples and isolates the JavaScript playground',async({page})=>{
  await page.getByRole('link',{name:'Practice Library',exact:true}).click();
  await page.getByRole('button',{name:'Coding IDE'}).click();
  const editor=page.getByRole('textbox',{name:'Your code'});
  await expect(page.getByRole('combobox',{name:'Challenge',exact:true}).locator('option')).toHaveCount(20);
  await editor.fill('const solve = (a, b) => a + b;');
  await page.getByRole('button',{name:'Run examples'}).click();
  await expect(page.getByText('Passed',{exact:true})).toHaveCount(2);
  await page.getByRole('button',{name:'Java',exact:true}).click();
  await expect(editor).toHaveValue(/static int solve/);
  await page.getByRole('button',{name:'Get a hint'}).click();
  await expect(page.getByRole('heading',{name:'Coding coach'})).toBeVisible({timeout:40000});
  await page.getByRole('button',{name:'Python',exact:true}).click();
  await expect(editor).toHaveValue(/def solve/);
  await page.getByRole('button',{name:'JavaScript',exact:true}).click();
  await expect(editor).toHaveValue('const solve = (a, b) => a + b;');
  await page.getByRole('button',{name:'JavaScript playground'}).click();
  await editor.fill('console.log(6 * 7, typeof fetch, typeof localStorage, typeof XMLHttpRequest);');
  await page.getByRole('button',{name:'Run JavaScript'}).click();
  await expect(page.getByText('42 undefined undefined undefined',{exact:true})).toBeVisible();
  await editor.fill('while (true) {}');
  await page.getByRole('button',{name:'Run JavaScript'}).click();
  await expect(page.getByRole('alert')).toContainText(/interrupt|timed out/i,{timeout:12000});
  await editor.fill('console.log("ready again");');
  await page.getByRole('button',{name:'Run JavaScript'}).click();
  await expect(page.getByText('ready again',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Behavioral',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Behavioral questions'})).toBeVisible();
});

test('Resume Mock cites five passages and saves an owner-only, ungraded interview',async({page,request})=>{
  test.setTimeout(90000);
  await page.getByRole('link',{name:'Resume Mock'}).click();
  await expect(page.getByRole('img',{name:'AVA wearing an interview headset'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'AVA · Resume interviewer'})).toBeVisible();
  await page.getByLabel('Target job').fill('Backend Developer');
  const resume=[
    'Built a PostgreSQL booking service with transaction locks to prevent duplicate reservations.',
    'Migrated reporting jobs to Python queues with automatic retries and idempotent task keys.',
    'Implemented Redis cache invalidation for a product catalogue and measured response latency.',
    'Designed a Java Spring Boot payment gateway with structured audit events and access controls.',
    'Configured Docker health checks and deployment rollback for a containerized analytics dashboard.',
    'example@example.com',
  ].join('\n');
  await page.getByLabel('Upload resume').setInputFiles({name:'example.txt',mimeType:'text/plain',buffer:Buffer.from(resume)});
  const created=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/resume-mocks'));
  await page.getByRole('button',{name:'Prepare resume mock'}).click();
  const response=await created;
  expect(response.status()).toBe(201);
  const mock=await response.json();
  expect(mock.questions).toHaveLength(5);
  expect(new Set(mock.questions.map((question:{source:{excerpt:string}})=>question.source.excerpt)).size).toBe(5);
  expect(JSON.stringify(mock)).not.toContain('example@example.com');
  await expect(page.locator('ol.resume-previews > li')).toHaveCount(5);
  expect(await page.getByRole('heading',{name:'Ask Ava',exact:true}).count()).toBe(0);

  const otherUser=await (await request.post('/api/auth/demo',{data:{}})).json();
  const foreign=await request.get('/api/resume-mocks/'+mock.id,{headers:{Authorization:'Bearer '+otherUser.token}});
  expect(foreign.status()).toBe(404);
  await page.getByRole('button',{name:'Start resume interview'}).click();
  await expect(page.getByRole('heading',{name:'Question 1 of 5'})).toBeVisible();
  await page.getByRole('button',{name:'Spoken replies on'}).click();
  for(let index=0;index<5;index++){
    await expect(page.getByRole('heading',{name:'Question '+(index+1)+' of 5'})).toBeVisible();
    await page.getByLabel('Your resume answer').fill('I owned the implementation and verified the behavior with integration tests.');
    await page.getByRole('button',{name:'Continue to follow-up'}).click();
    await expect(page.getByRole('heading',{name:'Follow-up',exact:true})).toBeVisible();
    await page.getByLabel('Follow-up answer (optional)').fill('I reviewed test logs to confirm the result.');
    await page.getByRole('button',{name:index===4?'Finish resume mock':'Save and continue'}).click();
  }
  await expect(page.getByRole('heading',{name:'Resume mock complete'})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:/Backend Developer.*5 \/ 5 answered/}).click();
  await expect(page.getByRole('heading',{name:'Resume mock complete'})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Delete resume mock for Backend Developer'}).click();
  await expect(page.getByText('Your saved mocks appear here.')).toBeVisible();
});
