from io import BytesIO
import json
import sys
from types import SimpleNamespace
from docx import Document
import httpx
import pytest
from fastapi.testclient import TestClient
from app import main,study,speech
from app.local_slm import ModelOutput,LocalModelUnavailable


TEXT='Atomicity means a transaction commits all changes together or rolls them all back. Isolation keeps concurrent transactions from interfering. Durability preserves committed changes after a restart.'


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('INTERNAL_SERVICE_TOKEN','study-test-key')
    return TestClient(main.app,headers={'X-Internal-Token':'study-test-key'})


def payload(kind='notes',count=3):
    return study.StudyRequest(title='Database notes',chunks=[{'id':'chunk-1','text':TEXT,'locator':'Paragraph 1'}],kind=kind,request='Explain database transactions for a beginner',count=count)


def test_private_document_accepts_ordinary_prose_and_preserves_locator(client):
    response=client.post('/internal/documents/extract',files={'file':('notes.txt',TEXT.encode())})
    assert response.status_code==200
    assert response.json()['chunks'][0]['text']==TEXT
    assert response.json()['chunks'][0]['locator'].startswith('Text')


def test_docx_prose_does_not_require_existing_question_answer_pairs(client):
    doc=Document();doc.add_paragraph(TEXT);output=BytesIO();doc.save(output)
    response=client.post('/internal/documents/extract',files={'file':('lesson.docx',output.getvalue())})
    assert response.status_code==200 and response.json()['chunks'][0]['locator'].startswith('Paragraph 1')


def test_markdown_sections_keep_fenced_examples_together():
    markdown = "# Shell examples\n~~~sh\n# This is a comment\nprintf 'hello'\n~~~\n\n# Output\nThe command prints hello."
    document = study.extract('lesson.md', markdown.encode(), 'Shell examples')
    assert document['chunk_count'] == 2
    assert '# This is a comment' in document['chunks'][0]['text']
    assert document['chunks'][1]['text'].startswith('# Output')


@pytest.mark.parametrize('name,body',[('script.exe',b'bad'),('notes.txt',b'\x00binary'),('empty.txt',b''),('bad.pdf',b'not a PDF')])
def test_unsafe_or_unreadable_documents_are_rejected(client,name,body):
    assert client.post('/internal/documents/extract',files={'file':(name,body)}).status_code==422


def test_document_size_and_private_service_auth(client):
    assert client.post('/internal/documents/extract',files={'file':('large.txt',b'x'*5_000_001)}).status_code==413
    assert client.get('/internal/voice/status',headers={'X-Internal-Token':'wrong'}).status_code==401
    assert client.post('/internal/documents/extract',headers={'X-Internal-Token':'wrong'},files={'file':('notes.txt',TEXT)}).status_code==401


def test_model_notes_use_document_material_and_user_request(monkeypatch):
    class Model:
        def complete(self,system,prompt,**kwargs):
            assert 'Atomicity' in prompt and 'beginner' in prompt
            assert 'sections' in kwargs['response_schema']['properties']
            body = {
                'summary': 'A transaction groups related changes.',
                'sections': [{'heading': 'Atomicity', 'text': 'All changes commit or roll back.', 'citation_ids': ['chunk-1']}],
            }
            return ModelOutput(json.dumps(body),1,{}, {'provider':'llama.cpp'})
    monkeypatch.setattr(study,'LocalSLM',Model)
    result=study.generate(payload())
    assert result['mode']=='local_slm' and result['sources'][0]['locator']=='Paragraph 1'
    assert result['sections'][0]['citation_ids'] == ['chunk-1']


def test_requested_count_and_citations_are_verified(monkeypatch):
    class Model:
        def complete(self,*args,**kwargs):
            questions=[{'question':f'What does transaction property {i} ensure?','answer':'All changes commit or roll back.','citation_ids':['chunk-1']} for i in range(3)]
            return ModelOutput(json.dumps({'questions':questions}),1,{}, {})
    monkeypatch.setattr(study,'LocalSLM',Model)
    result=study.generate(payload('questions',3))
    assert result['mode']=='local_slm' and len(result['questions'])==3
    assert all(q['citation_ids']==['chunk-1'] for q in result['questions'])


def test_requested_fact_near_end_of_passage_is_in_model_input_and_visible_citation(monkeypatch):
    class Model:
        def complete(self,system,prompt,**kwargs):
            passage=json.loads(prompt)['passages'][0]['text']
            assert 'Durability means committed changes survive a restart.' in passage
            assert len(passage.encode('utf-8'))<=1150
            body = {
                'summary': 'Committed changes survive a restart.',
                'sections': [{'heading': 'Durability', 'text': 'Committed data survives a restart.', 'citation_ids': ['chunk-1']}],
            }
            return ModelOutput(json.dumps(body),1,{}, {})
    monkeypatch.setattr(study,'LocalSLM',Model)
    request=study.StudyRequest(title='Lecture',chunks=[{'id':'chunk-1','text':'General background information. '*30+'Durability means committed changes survive a restart.','locator':'Page 2'}],kind='notes',request='Explain durability after a restart.')
    result=study.generate(request)
    assert result['mode']=='local_slm'
    assert 'Durability means committed changes survive a restart.' in result['sources'][0]['excerpt']


def test_valid_json_fences_from_the_real_model_are_accepted_without_relaxing_citations(monkeypatch):
    class Model:
        def complete(self,*args,**kwargs):
            body={'questions':[{'question':'What is atomicity?','answer':'All changes commit or roll back.','citation_ids':['chunk-1']}]}
            return ModelOutput('```json\n'+json.dumps(body)+'\n```',1,{}, {})
    monkeypatch.setattr(study,'LocalSLM',Model)
    result=study.generate(payload('questions',1))
    assert result['mode']=='local_slm' and result['questions'][0]['citation_ids']==['chunk-1']


@pytest.mark.parametrize('body',[{'questions':[]},{'questions':[{'question':'Fake?','answer':'Fake','citation_ids':['invented']}]}])
def test_invented_citations_or_wrong_count_fall_back_honestly(monkeypatch,body):
    class Model:
        def complete(self,*args,**kwargs):
            return ModelOutput(json.dumps(body),1,{}, {})
    monkeypatch.setattr(study,'LocalSLM',Model)
    result=study.generate(payload('questions',5))
    assert result['mode']=='extractive' and result['warning']
    assert len(result['questions'])==5 and len({q['question'] for q in result['questions']})==5


def test_unavailable_model_preserves_source_notes(monkeypatch):
    monkeypatch.setenv('SLM_ENABLED','false')
    result=study.generate(payload())
    assert result['mode']=='extractive' and result['summary_citation_ids'] == ['chunk-1']
    assert result['summary'] + ' ' + result['sections'][0]['text'] == TEXT


def test_overview_retrieves_late_sections_and_keeps_uncited_source_details(monkeypatch):
    class Model:
        def complete(self, system, prompt, **kwargs):
            passages = json.loads(prompt)['passages']
            assert [passages[0]['id'], passages[-1]['id']] == ['chunk-1', 'chunk-12']
            body = {
                'summary': 'The lesson covers transactions.',
                'sections': [{'heading': 'Introduction', 'text': 'Transactions coordinate changes.', 'citation_ids': ['chunk-1']}],
            }
            return ModelOutput(json.dumps(body), 1, {}, {})

    monkeypatch.setattr(study, 'LocalSLM', Model)
    chapters = '\n\n'.join(f'## Chapter {i}\nTransactions coordinate related changes in scenario {i}.' for i in range(1, 13))
    document = study.extract('transactions.md', chapters.encode(), 'Transactions')
    request = study.StudyRequest(
        title=document['title'], chunks=document['chunks'], kind='notes',
        request='Give me detailed notes on the main ideas of this document.',
    )
    result = study.generate(request)
    assert result['mode'] == 'local_slm'
    assert result['sections'][-1] == {
        'heading': 'Chapter 12', 'text': 'Transactions coordinate related changes in scenario 12.',
        'citation_ids': ['chunk-12'], 'mode': 'extractive',
    }
    assert len(result['sources']) == 10


def test_focused_source_notes_do_not_fall_back_to_unrelated_first_pages(monkeypatch):
    monkeypatch.setenv('SLM_ENABLED', 'false')
    request = study.StudyRequest(
        title='Data systems', kind='notes', request='Explain replication and failover.',
        chunks=[
            {'id': 'chunk-1', 'locator': 'Page 1', 'text': 'Collations determine how strings sort.'},
            {'id': 'chunk-2', 'locator': 'Page 8', 'text': 'Replication copies data. Failover promotes a standby.'},
        ],
    )
    result = study.generate(request)
    assert [source['id'] for source in result['sources']] == ['chunk-2']
    assert result['summary'] == 'Replication copies data.'
    assert result['sections'][0]['text'] == 'Failover promotes a standby.'


def test_missing_voice_returns_visible_503_not_fake_audio(client,monkeypatch,tmp_path):
    monkeypatch.setenv('PIPER_MODEL_PATH',str(tmp_path/'absent.onnx'))
    assert client.get('/internal/voice/status').json()['available'] is False
    assert client.post('/internal/voice/speech',json={'text':'Hello'}).status_code==503


def test_voice_returns_valid_wave_and_no_cache(client,monkeypatch,tmp_path):
    path=tmp_path/'voice.onnx';path.touch();(tmp_path/'voice.onnx.json').write_text('{}')
    monkeypatch.setenv('PIPER_MODEL_PATH',str(path))
    monkeypatch.setattr(speech.importlib.util,'find_spec',lambda name:object())
    monkeypatch.setitem(sys.modules,'piper',SimpleNamespace(PiperVoice=object))
    class FakeVoice:
        def synthesize_wav(self,text,audio):
            audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(22050);audio.writeframes(b'\x00\x00'*2205)
    monkeypatch.setattr(speech,'_voice',FakeVoice());monkeypatch.setattr(speech,'_voice_path',path)
    response=client.post('/internal/voice/speech',json={'text':'Hello'})
    assert response.status_code==200 and response.content.startswith(b'RIFF')
    assert response.headers['content-type']=='audio/wav' and response.headers['cache-control']=='no-store'
    assert client.post('/internal/voice/speech',json={'text':'x'*2001}).status_code==422
