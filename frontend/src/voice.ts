import {useCallback,useEffect,useRef,useState} from 'react';
import {getToken} from './api';

interface SpeechResultEvent {results:{length:number;[index:number]:{isFinal:boolean;[index:number]:{transcript:string}}}}
interface Recognition {continuous:boolean;interimResults:boolean;lang:string;onresult:((event:SpeechResultEvent)=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void}
type VoiceWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};

interface ListenOptions {onTranscript?:(text:string)=>void;onComplete?:(text:string)=>void;onError?:()=>void}
interface SpeakOptions {onEnd?:()=>void;onError?:()=>void}
const playbackError='Speech playback is unavailable. Read the question on screen and type your answer to continue.';
const noSpeechError='No speech was detected. Try again or type your answer.';
const speechChunks=(text:string)=>{
  const chunks:string[]=[];
  while(text.length>1800){
    let end=text.lastIndexOf(' ',1799);
    end=end>=900?end+1:1800;
    const last=text.charCodeAt(end-1);
    if(last>=0xD800&&last<=0xDBFF)end--;
    chunks.push(text.slice(0,end));text=text.slice(end);
  }
  if(text)chunks.push(text);
  return chunks;
};
export function useVoice(onTranscript:(text:string)=>void){
  const [listening,setListening]=useState(false),[speaking,setSpeaking]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState('');
  const recognition=useRef<Recognition|null>(null),callback=useRef(onTranscript),generation=useRef(0),utterance=useRef<SpeechSynthesisUtterance|null>(null),audio=useRef<HTMLAudioElement|null>(null),audioUrl=useRef(''),request=useRef<AbortController|null>(null),voices=useRef<SpeechSynthesisVoice[]>([]);
  callback.current=onTranscript;
  const supported=!!((window as VoiceWindow).SpeechRecognition||(window as VoiceWindow).webkitSpeechRecognition);
  const stop=useCallback(()=>{
    generation.current++;recognition.current?.abort();recognition.current=null;request.current?.abort();request.current=null;
    if('speechSynthesis' in window)window.speechSynthesis.cancel();utterance.current=null;
    if(audio.current){audio.current.pause();audio.current.removeAttribute('src');audio.current=null}
    if(audioUrl.current){URL.revokeObjectURL(audioUrl.current);audioUrl.current=''}
    setListening(false);setSpeaking(false);setPreparing(false);
  },[]);
  useEffect(()=>{
    const load=()=>{if('speechSynthesis' in window&&typeof window.speechSynthesis.getVoices==='function')voices.current=window.speechSynthesis.getVoices()};
    load();window.speechSynthesis?.addEventListener?.('voiceschanged',load);
    return()=>{window.speechSynthesis?.removeEventListener?.('voiceschanged',load);stop()};
  },[stop]);
  const listen=useCallback((options:ListenOptions={})=>{
    const Constructor=(window as VoiceWindow).SpeechRecognition||(window as VoiceWindow).webkitSpeechRecognition;
    if(!Constructor){setError('Speech recognition is not supported in this browser. You can type your answer below.');options.onError?.();return}
    stop();setError('');const id=generation.current;let finalText='';let failed=false;let completed=false;
    const next=new Constructor();next.continuous=!options.onComplete;next.interimResults=true;next.lang=navigator.language||'en-US';
    next.onresult=event=>{if(id!==generation.current)return;let transcript='';finalText='';for(let i=0;i<event.results.length;i++){transcript+=event.results[i][0].transcript+' ';if(event.results[i].isFinal)finalText+=event.results[i][0].transcript+' '}(options.onTranscript??callback.current)(transcript.trim())};
    next.onerror=event=>{if(id!==generation.current||failed||completed)return;failed=true;setListening(false);setError(event.error==='not-allowed'||event.error==='service-not-allowed'?'Microphone access was denied. Type your answer below to continue.':event.error==='no-speech'?noSpeechError:`Speech recognition stopped (${event.error}). Your typed answer is still available.`);options.onError?.()};
    next.onend=()=>{if(id!==generation.current||failed||completed)return;setListening(false);if(options.onComplete){completed=true;if(finalText.trim())options.onComplete(finalText.trim());else{setError(noSpeechError);options.onError?.()}}};
    recognition.current=next;try{next.start();setListening(true)}catch{setListening(false);setError('Microphone could not start. You can continue with a typed answer.');options.onError?.()}
  },[stop]);
  const speak=useCallback((text:string,options:SpeakOptions={})=>{
    stop();setError('');const id=generation.current;
    const chunks=speechChunks(text.replace(/```[\s\S]*?```/g,' See the code example on screen. ').replace(/[*#`]/g,''));
    let finished=false;
    const current=()=>id===generation.current&&!finished;
    const failed=()=>{if(!current())return;finished=true;setPreparing(false);setSpeaking(false);setError(playbackError);options.onError?.()};
    const playChunk=(index:number)=>{
      if(!current())return;
      if(index===chunks.length){finished=true;setPreparing(false);setSpeaking(false);options.onEnd?.();return}
      if(audio.current){audio.current.pause();audio.current.removeAttribute('src');audio.current=null}
      if(audioUrl.current){URL.revokeObjectURL(audioUrl.current);audioUrl.current=''}
      let complete=false,usingServer=false;
      const active=()=>current()&&!complete;
      const ended=()=>{if(!active())return;complete=true;playChunk(index+1)};
      const serverVoice=async()=>{
        if(!active()||usingServer)return;usingServer=true;setPreparing(true);setSpeaking(false);
        const controller=new AbortController();request.current=controller;const timer=setTimeout(()=>controller.abort(),20000);
        try{
          const response=await fetch('/api/voice/speech',{method:'POST',headers:{'Content-Type':'application/json',...(getToken()?{Authorization:`Bearer ${getToken()}`}:{})},body:JSON.stringify({text:chunks[index]}),signal:controller.signal});
          if(!response.ok)throw new Error('Local speech unavailable');const blob=await response.blob();if(!active())return;
          const element=new Audio();audio.current=element;audioUrl.current=URL.createObjectURL(blob);element.src=audioUrl.current;
          element.onplaying=()=>{if(active()){setPreparing(false);setSpeaking(true)}};element.onended=ended;element.onerror=()=>{if(active())failed()};
          await element.play();
        }catch{if(active())failed()}finally{clearTimeout(timer);if(request.current===controller)request.current=null}
      };
      if(!('speechSynthesis' in window)){void serverVoice();return}
      const available=typeof window.speechSynthesis.getVoices==='function'?window.speechSynthesis.getVoices():voices.current;
      if(!available.length){void serverVoice();return}
      const next=new SpeechSynthesisUtterance(chunks[index]);utterance.current=next;next.rate=0.95;next.voice=available.find(v=>v.lang.startsWith('en')&&v.localService)??available.find(v=>v.lang.startsWith('en'))??available[0];next.lang=next.voice.lang;
      setPreparing(true);setSpeaking(false);
      next.onstart=()=>{if(active()&&!usingServer){setPreparing(false);setSpeaking(true)}};
      next.onend=()=>{if(!usingServer)ended()};next.onerror=()=>void serverVoice();
      try{window.speechSynthesis.speak(next)}catch{void serverVoice()}
    };
    playChunk(0);
  },[stop]);
  return {listening,speaking,preparing,supported,ttsSupported:true,error,listen,speak,stop,finishListening:()=>recognition.current?.stop(),clearError:()=>setError('')};
}
export type VoiceController=ReturnType<typeof useVoice>;
