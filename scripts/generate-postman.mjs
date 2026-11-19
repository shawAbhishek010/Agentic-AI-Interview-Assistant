import {writeFileSync} from 'node:fs';
const requests=[
  {name:'Health',method:'GET',path:'/api/health',auth:false},
  {name:'Create isolated demo account',method:'POST',path:'/api/auth/demo',body:{},auth:false,capture:'auth'},
  {name:'Current user',method:'GET',path:'/api/me'},
  {name:'Supported role catalog',method:'GET',path:'/api/catalog'},
  {name:'React questions',method:'GET',path:'/api/questions?role=React%20Developer'},
  {name:'Start exactly five grounded questions',method:'POST',path:'/api/interviews',body:{role:'Backend Developer'},capture:'interview'},
  {name:'Read interview',method:'GET',path:'/api/interviews/{{interview_id}}'},
  {name:'Submit current answer',method:'POST',path:'/api/interviews/{{interview_id}}/answers',body:{question_id:'{{question_id}}',answer:'An asynchronous callback lets other work continue while a pending operation completes.'}},
  {name:'Save and end partial interview',method:'POST',path:'/api/interviews/{{interview_id}}/finish',body:{cancel:true}},
  {name:'Practice overview',method:'GET',path:'/api/analytics/overview'},
  {name:'Topic progress',method:'GET',path:'/api/analytics/topics'},
  {name:'Cited closure answer',method:'POST',path:'/api/knowledge/query',body:{query:'What are JavaScript closures?'}},
  {name:'Missing-source fallback',method:'POST',path:'/api/knowledge/query',body:{query:'Explain photosynthesis chloroplasts in orchids'},capture:'fallback'},
  {name:'Source catalog',method:'GET',path:'/api/sources'},
  {name:'Admin catalog (403 for demo user)',method:'GET',path:'/api/admin/sources',capture:'denied'},
];
const assertions={
  auth:[`pm.test('Demo auth succeeds',()=>pm.response.to.have.status(200));`,`pm.collectionVariables.set('token',pm.response.json().token);`],
  interview:[`pm.test('Created five grounded questions',()=>{pm.response.to.have.status(201);const b=pm.response.json();pm.expect(b.questions).to.have.length(5);pm.expect(new Set(b.questions.map(q=>q.id)).size).to.eql(5);b.questions.forEach(q=>{pm.expect(q.answer).to.be.a('string');pm.expect(q.follow_up).to.be.a('string');pm.expect(q.source.url).to.match(/^https:/);});pm.collectionVariables.set('interview_id',b.id);pm.collectionVariables.set('question_id',b.questions[0].id);});`],
  fallback:[`pm.test('No invented answer or citation',()=>{const b=pm.response.json();pm.expect(b.answer).to.eql('Not found in the interview knowledge base');pm.expect(b.questions).to.have.length(0);});`],
  denied:[`pm.test('Demo user cannot administer sources',()=>pm.response.to.have.status(403));`],
};
const item=requests.map(r=>({name:r.name,request:{method:r.method,header:[...(r.auth===false?[]:[{key:'Authorization',value:'Bearer {{token}}'}]),...(r.body?[{key:'Content-Type',value:'application/json'}]:[])],url:'{{base_url}}'+r.path,...(r.body?{body:{mode:'raw',raw:JSON.stringify(r.body,null,2),options:{raw:{language:'json'}}}}:{})},event:[{listen:'test',script:{type:'text/javascript',exec:assertions[r.capture]??[`pm.test('Request succeeds',()=>pm.expect(pm.response.code).to.be.within(200,299));`]}}]}));
writeFileSync(new URL('../docs/Placement-AI.postman_collection.json',import.meta.url),JSON.stringify({info:{name:'Placement AI — live REST demonstration',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',description:'Run requests in order. This creates an isolated demo account. No paid model calls or live SLM inference are claimed.'},variable:[{key:'base_url',value:'http://127.0.0.1:8088'},{key:'token',value:''},{key:'interview_id',value:''},{key:'question_id',value:''}],item},null,2)+'\n');
console.log(`Generated ${item.length} runnable Postman requests.`);
