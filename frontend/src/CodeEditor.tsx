import {useLayoutEffect,useRef} from 'react';
import {closeBrackets,closeBracketsKeymap} from '@codemirror/autocomplete';
import {defaultKeymap,history,historyKeymap,indentWithTab,temporarilySetTabFocusMode} from '@codemirror/commands';
import {java} from '@codemirror/lang-java';
import {javascript} from '@codemirror/lang-javascript';
import {python} from '@codemirror/lang-python';
import {bracketMatching,defaultHighlightStyle,indentOnInput,indentUnit,syntaxHighlighting} from '@codemirror/language';
import {search,searchKeymap} from '@codemirror/search';
import {Compartment,EditorState} from '@codemirror/state';
import {EditorView,keymap,lineNumbers} from '@codemirror/view';
import type {CodingLanguage} from './coding-types';

const LANGUAGES={javascript:javascript(),java:java(),python:python()};
const MAX_CODE_LENGTH=12000;
const editable=new Compartment();

interface Props {
  draftKey:string;
  code:string;
  language:CodingLanguage;
  readOnly:boolean;
  onChange:(code:string)=>void;
  onRun?:(code:string)=>void;
}

export function CodeEditor({draftKey,code,language,readOnly,onChange,onRun}:Props){
  const host=useRef<HTMLDivElement>(null);
  const active=useRef<EditorView|null>(null);
  const states=useRef(new Map<string,EditorState>());
  const current=useRef({code,onChange,onRun});

  useLayoutEffect(()=>{current.current={code,onChange,onRun}},[code,onChange,onRun]);

  useLayoutEffect(()=>{
    if(!host.current)return;
    const spaces=language==='javascript'?2:4;
    const state=states.current.get(draftKey)??EditorState.create({
      doc:current.current.code,
      extensions:[
        LANGUAGES[language],
        indentUnit.of(' '.repeat(spaces)),
        EditorState.tabSize.of(spaces),
        lineNumbers(),
        history(),
        search({top:true}),
        indentOnInput(),
        closeBrackets(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle),
        editable.of([]),
        EditorState.changeFilter.of(transaction=>transaction.newDoc.length<=MAX_CODE_LENGTH),
        EditorView.contentAttributes.of({
          'aria-label':'Your code',
          'aria-describedby':'coding-editor-keys',
          tabindex:'0',
          spellcheck:'false',
          autocapitalize:'off',
          autocorrect:'off',
        }),
        EditorView.updateListener.of(update=>{
          if(update.docChanged)current.current.onChange(update.state.doc.toString());
        }),
        EditorView.domEventObservers({
          keydown(event,view){
            if(event.key==='Escape')temporarilySetTabFocusMode(view);
          },
        }),
        keymap.of([
          {key:'Mod-Enter',run:view=>{
            const execute=current.current.onRun;
            if(!execute)return false;
            if(!view.state.readOnly)execute(view.state.doc.toString());
            return true;
          }},
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
      ],
    });
    const view=new EditorView({state,parent:host.current});
    active.current=view;
    return ()=>{
      states.current.set(draftKey,view.state);
      view.destroy();
      active.current=null;
    };
  },[draftKey,language]);

  useLayoutEffect(()=>{
    const view=active.current;
    if(!view)return;
    if(view.state.readOnly!==readOnly){
      view.dispatch({effects:editable.reconfigure([EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly)])});
    }
    if(view.state.doc.toString()!==code){
      view.dispatch({changes:{from:0,to:view.state.doc.length,insert:code}});
    }
  },[code,draftKey,readOnly]);

  return <>
    <div ref={host} className="code-editor-host"/>
    <p id="coding-editor-keys" className="small-text muted coding-editor-keys">
      Tab to indent · Shift+Tab to outdent · Esc then Tab to move focus
      {onRun?' · Ctrl/⌘+Enter to run':''}
    </p>
  </>;
}
