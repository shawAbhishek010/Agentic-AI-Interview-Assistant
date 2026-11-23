import type {ModelInfo} from './types';

export type CodingLanguage = 'javascript' | 'java' | 'python';
export type Example = {input:unknown[]; expected:unknown};
export type Challenge = {
  id:string; title:string; prompt:string;
  starter:Record<CodingLanguage,string>;
  examples:Example[];
};
export type CodingReply = {mode:'local_slm'|'demo'; text:string; warning?:string; model?:ModelInfo; review_basis?:'static'};
export type RunRequest = {code:string; examples:Example[]};
export type SampleResult = {expected:string; actual:string; passed:boolean};
export type RunResult = {logs:string[]; cases:SampleResult[]; error?:string};
