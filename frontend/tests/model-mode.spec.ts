import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';

// These fixtures test provenance labels and request intent; they are not model evidence.
const model={provider:'llama.cpp',model_id:'Llama-3.2-3B-Instruct',status:'ready',local:true};
const source={id:'fixture',title:'Mock test bank',url:'https://example.org/test-bank',license:'MIT',locator:'fixture only'};
const questions=Array.from({length:5},(_,i)=>({id:`q${i+1}`,role:'Frontend Developer',topic:'JavaScript',difficulty:'beginner',question:`Explain closure example ${i+1}`,answer:'A closure retains lexical scope.',follow_up:'Give a closure example.',concepts:['lexical scope'],source}));

async function mockWorkspace(page:Page,{status='ready',testFails=false,queryFallback=false,generatedFollowUp=false}={}){
  const runtime={...model,status};
  const queryRequests:{use_model:boolean}[]=[];
  const sessions=generatedFollowUp?[{id:'saved-session',role:'Frontend Developer',topic:null,difficulty:null,status:'completed',questions,turns:[{question_id:'q1',answer:'A closure retains lexical scope.',answered_at:'2026-11-17T05:00:00Z',evaluation:{score:100,accuracy:100,completeness:100,clarity:100,matched_concepts:['lexical scope'],missing_concepts:[],feedback:['A rule-based concept score.'],follow_up:'How would closure lifetime affect memory?',follow_up_mode:'local_slm',mode:'demo',model:runtime,source}}],created_at:'2026-11-17T05:00:00Z',finished_at:'2026-11-17T05:01:00Z',trace:[],mode:'demo'}]:[];
  if(generatedFollowUp)await page.addInitScript(()=>localStorage.setItem('placement_ai_session','saved-session'));
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let result:unknown;
    if(path==='/api/auth/demo')result={token:'mock-only',user:{id:'mock-user',name:'Student',email:'mock@example.org',role:'USER'}};
    else if(path==='/api/catalog')result={roles:['Frontend Developer'],topics:['JavaScript'],question_count:5,mode:'demo',model:runtime};
    else if(path==='/api/analytics/overview')result={interviews_completed:0,questions_practiced:0,average_score:null,streak:0,topics_covered:0,score_trend:[],recent_interviews:[],recommendations:[]};
    else if(path==='/api/questions')result=questions;
    else if(path==='/api/interviews')result=sessions;
    else if(path==='/api/model/status')result=runtime;
    else if(path==='/api/model/test'){
      if(testFails){await route.fulfill({status:503,json:{message:'Local model is unavailable'}});return}
      result={mode:'local_slm',model:runtime,prompt:'What is a closure?',response:'This mock response exercises the model output label.',latency_ms:125,usage:{completion_tokens:9}};
    }
    else if(path==='/api/knowledge/query'){
      const body=route.request().postDataJSON() as {use_model:boolean};queryRequests.push(body);
      const generated=body.use_model&&!queryFallback;
      result={answer:generated?'This mock local answer explains lexical scope.':questions[0].answer,questions:questions.slice(0,1),trace:[],mode:generated?'local_slm':'demo',...(generated?{model:runtime}:{}),...(queryFallback?{warning:'Local generation timed out; showing the original source answer.'}:{})};
    }
    else result=[];
    await route.fulfill({json:result});
  });
  await page.goto(generatedFollowUp?'/#feedback':'/#knowledge');
  await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await expect(page.getByRole('heading',{name:generatedFollowUp?'Feedback & review':'Knowledge base',level:1,exact:true})).toBeVisible();
  return queryRequests;
}

test('mocked ready status is distinct from an actual model test response',async({page})=>{
  await mockWorkspace(page);
  await page.getByRole('button',{name:'Agent workspace',exact:true}).click();
  await expect(page.getByText('ready',{exact:true})).toBeVisible();
  await expect(page.getByText(/Built with Llama/)).toHaveCount(0);
  await page.getByRole('button',{name:'Run local model test'}).click();
  await expect(page.getByText('This mock response exercises the model output label.')).toBeVisible();
  await expect(page.getByText(/Local SLM · Llama-3.2-3B-Instruct · Built with Llama/)).toBeVisible();
});

test('mocked disabled and failed runtimes never display a successful response',async({page})=>{
  await mockWorkspace(page,{status:'disabled'});
  await page.getByRole('button',{name:'Agent workspace',exact:true}).click();
  await expect(page.getByRole('button',{name:'Run local model test'})).toBeDisabled();
  await expect(page.getByText('disabled',{exact:true})).toBeVisible();
  await expect(page.getByText(/Built with Llama/)).toHaveCount(0);
});

test('mocked unavailable model test preserves an honest error',async({page})=>{
  await mockWorkspace(page,{testFails:true});
  await page.getByRole('button',{name:'Agent workspace',exact:true}).click();
  await page.getByRole('button',{name:'Run local model test'}).click();
  await expect(page.getByRole('alert')).toContainText('Local model is unavailable');
  await expect(page.getByText(/Built with Llama/)).toHaveCount(0);
});

test('mocked RAG queries require explicit SLM opt-in and label the returned mode',async({page})=>{
  const requests=await mockWorkspace(page);
  await page.getByRole('button',{name:'RAG inspector',exact:true}).click();
  await page.getByRole('textbox',{name:'Knowledge query'}).fill('What is a closure?');
  await page.getByRole('button',{name:'Retrieve answer'}).click();
  await expect(page.locator('.rag-answer')).toContainText('A closure retains lexical scope.');
  expect(requests[0].use_model).toBe(false);
  await expect(page.getByText(/Built with Llama/)).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Use local SLM for this answer'}).check();
  await page.getByRole('button',{name:'Retrieve answer'}).click();
  await expect(page.locator('.rag-answer')).toContainText('This mock local answer explains lexical scope.');
  expect(requests[1].use_model).toBe(true);
  await expect(page.getByText(/Local SLM · Llama-3.2-3B-Instruct · Built with Llama/)).toBeVisible();
  await page.getByRole('button',{name:'Public sources',exact:true}).click();
  await page.getByRole('textbox',{name:'Ask the knowledge base'}).fill('What is a closure?');
  await page.getByRole('button',{name:'Ask',exact:true}).click();
  await expect(page.locator('.rag-answer')).toContainText('A closure retains lexical scope.');
  expect(requests[2].use_model).toBe(false);
});

test('mocked SLM fallback shows its warning and the source answer mode',async({page})=>{
  await mockWorkspace(page,{queryFallback:true});
  await page.getByRole('button',{name:'RAG inspector',exact:true}).click();
  await page.getByRole('textbox',{name:'Knowledge query'}).fill('What is a closure?');
  await page.getByRole('checkbox',{name:'Use local SLM for this answer'}).check();
  await page.getByRole('button',{name:'Retrieve answer'}).click();
  await expect(page.getByRole('status')).toContainText('Local generation timed out');
  await expect(page.locator('.rag-answer')).toContainText('A closure retains lexical scope.');
  await expect(page.getByText(/Built with Llama/)).toHaveCount(0);
});

test('mocked generated follow-up never relabels the deterministic score as an SLM assessment',async({page})=>{
  await mockWorkspace(page,{generatedFollowUp:true});
  await expect(page.getByText('Rule-based rubric',{exact:true})).toBeVisible();
  await expect(page.getByText(/This score is not an SLM assessment/)).toBeVisible();
  await expect(page.getByText(/Try this locally generated follow-up aloud. Built with Llama/)).toBeVisible();
});
