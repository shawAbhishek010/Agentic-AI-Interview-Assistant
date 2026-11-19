const TOKEN_KEY='placement_ai_token';
export const getToken=()=>localStorage.getItem(TOKEN_KEY);
export const setToken=(token:string)=>localStorage.setItem(TOKEN_KEY,token);
export const clearToken=()=>localStorage.removeItem(TOKEN_KEY);
export class ApiError extends Error {constructor(message:string,public status:number){super(message)}}
export async function api<T>(path:string,options:RequestInit={},timeoutMs=30000):Promise<T>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),timeoutMs);
  const headers=new Headers(options.headers);
  if(getToken())headers.set('Authorization',`Bearer ${getToken()}`);
  if(options.body && !(options.body instanceof FormData))headers.set('Content-Type','application/json');
  try {
    const response=await fetch(`/api${path}`,{...options,headers,signal:options.signal??controller.signal});
    if(!response.ok){
      const error=await response.json().catch(()=>({}));
      throw new ApiError(typeof error.message==='string'?error.message:typeof error.detail==='string'?error.detail:`Request failed (${response.status})`,response.status);
    }
    return response.status===204?undefined as T:await response.json() as T;
  }catch(error){
    if(error instanceof ApiError)throw error;
    if(error instanceof DOMException && error.name==='AbortError')throw new Error('The request timed out. Your saved work is safe; please retry.');
    throw new Error('Cannot reach Placement AI. Check that the API and agent services are running.');
  }finally{window.clearTimeout(timer)}
}
export const post=<T>(path:string,body:unknown={},timeoutMs?:number)=>api<T>(path,{method:'POST',body:JSON.stringify(body)},timeoutMs);
export const errorMessage=(error:unknown)=>error instanceof Error?error.message:'Something went wrong. Please retry.';
export function safeUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'?url.href:undefined}catch{return undefined}}
