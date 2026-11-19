import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
const raw=JSON.parse(await readFile(new URL('../.runtime/postman.raw.json',import.meta.url),'utf8'));
const executions=raw.run.executions.map(e=>({name:e.item.name,method:e.request.method,status:e.response?.code,assertions:(e.assertions??[]).map(a=>({name:a.assertion,passed:!a.error,...(a.error?{error:a.error.message}:{})}))}));
const summary={recorded_at:new Date().toISOString(),runner:'Newman / Postman collection runtime',stats:raw.run.stats,failures:raw.run.failures.map(f=>({source:f.source?.name,message:f.error?.message})),executions};
await mkdir(new URL('../docs/evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('../docs/evidence/postman-summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
await unlink(new URL('../.runtime/postman.raw.json',import.meta.url));
console.log(JSON.stringify({requests:summary.stats.requests,assertions:summary.stats.assertions,failures:summary.failures.length},null,2));
