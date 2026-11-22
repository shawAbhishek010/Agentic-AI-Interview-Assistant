import {getQuickJS} from 'quickjs-emscripten';
import type {QuickJSContext, QuickJSHandle} from 'quickjs-emscripten';
import type {RunRequest,RunResult} from './coding-types';

const MAX_OUTPUT=4200;

function format(vm:QuickJSContext, handle:QuickJSHandle){
  if(vm.typeof(handle)==='undefined')return 'undefined';
  const value:unknown=vm.dump(handle);
  return (typeof value==='string'?value:JSON.stringify(value)??String(value)).slice(0,MAX_OUTPUT);
}

async function run({code,examples}:RunRequest):Promise<RunResult>{
  const logs:string[]=[];
  const cases:RunResult['cases']=[];
  const quickjs=await getQuickJS();
  const runtime=quickjs.newRuntime();
  runtime.setMemoryLimit(16*1024*1024);
  runtime.setMaxStackSize(512*1024);
  const deadline=performance.now()+1800;
  runtime.setInterruptHandler(()=>performance.now()>deadline);
  const vm=runtime.newContext();
  try {
    const logger=vm.newFunction('log',(...items)=>{
      if(logs.length<36){
        const line=items.slice(0,12).map(item=>format(vm,item)).join(' ');
        const remainder=MAX_OUTPUT-logs.reduce((count,entry)=>count+entry.length,0);
        if(remainder>0)logs.push(line.slice(0,remainder));
      }
    });
    const consoleHandle=vm.newObject();
    try {
      vm.setProp(consoleHandle,'log',logger);
      vm.setProp(consoleHandle,'warn',logger);
      vm.setProp(consoleHandle,'error',logger);
      vm.setProp(vm.global,'console',consoleHandle);
    } finally {
      consoleHandle.dispose();
      logger.dispose();
    }
    const program=vm.evalCode(code,'solution.js',{type:'global'});
    if(program.error){
      const detail=format(vm,program.error);
      program.error.dispose();
      return {logs,cases,error:detail};
    }
    try {
      if(!examples.length&&!logs.length&&vm.typeof(program.value)!=='undefined')logs.push(format(vm,program.value));
    } finally {
      program.value.dispose();
    }
    for(const example of examples){
      const expected=JSON.stringify(example.expected);
      const input=JSON.stringify(example.input);
      const evaluation=vm.evalCode('JSON.stringify(solve(...'+input+'))','sample.js',{type:'global'});
      if(evaluation.error){
        const detail=format(vm,evaluation.error);
        evaluation.error.dispose();
        return {logs,cases,error:detail};
      }
      try {
        const actual=vm.typeof(evaluation.value)==='string'?vm.getString(evaluation.value):'undefined';
        cases.push({expected,actual:actual.slice(0,MAX_OUTPUT),passed:actual===expected});
      } finally {
        evaluation.value.dispose();
      }
    }
    return {logs,cases};
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

self.addEventListener('message',({data}:MessageEvent<RunRequest>)=>{
  void run(data).then(result=>self.postMessage(result)).catch(()=>{
    self.postMessage({logs:[],cases:[],error:'The JavaScript sandbox could not complete this run.'} satisfies RunResult);
  });
});
