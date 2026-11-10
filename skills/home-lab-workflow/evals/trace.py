"""Export visible native subagent conversations and authoritative usage, not reasoning text."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sqlite3


CALL_TYPES = {'function_call', 'custom_tool_call'}
RESULT_TYPES = {'function_call_output', 'custom_tool_call_output'}


def normalize(records):
    events=[]; usages={}; cumulative=None; complete=False; duration=None
    for item in records:
        kind=item.get('type'); payload=item.get('payload',{})
        if kind=='token_usage_record':
            response=payload.get('response_id')
            if response and isinstance(payload.get('usage'),dict):
                usages[response]=payload['usage']
            if payload.get('thread_token_usage'):
                cumulative=payload['thread_token_usage']
        if kind=='event_msg' and payload.get('type')=='task_complete':
            complete=True;duration=payload.get('duration_ms')
        if kind!='response_item':
            continue
        subtype=payload.get('type')
        event={'id':f'e{len(events)+1:04d}','timestamp':item.get('timestamp')}
        if subtype in CALL_TYPES:
            event.update(kind='tool_call',call_id=payload.get('call_id'),name=payload.get('name'),namespace=payload.get('namespace'),input=payload.get('arguments',payload.get('input','')))
        elif subtype in RESULT_TYPES:
            event.update(kind='tool_result',call_id=payload.get('call_id'),output=payload.get('output'))
        elif subtype=='message' and payload.get('role') in {'assistant','user'}:
            text='\n'.join(block.get('text','') for block in payload.get('content',[]) if isinstance(block,dict) and block.get('type') in {'input_text','output_text','text'})
            if not text:continue
            event.update(kind=payload['role'],phase=payload.get('phase'),text=text)
        else:
            # Exclude all system/developer instructions and all reasoning items.
            continue
        events.append(event)
    totals=Counter()
    for usage in usages.values():
        for key,value in usage.items():
            if isinstance(value,(int,float)):totals[key]+=value
    measured=dict(totals) if usages else cumulative
    calls=[e for e in events if e['kind']=='tool_call']
    inputs=[e['input'] if isinstance(e['input'],str) else json.dumps(e['input']) for e in calls]
    duplicates=sum(count-1 for count in Counter(inputs).values() if count>1)
    result=dict(events=events,response_usage=[dict(response_id=key,**value) for key,value in usages.items()],usage=measured,usage_source='deduplicated_response_usage' if usages else 'last_thread_cumulative' if cumulative else 'unavailable',responses=len(usages),complete=complete,duration_ms=duration)
    result['metrics']=dict(tool_calls=len(calls),tool_results=sum(e['kind']=='tool_result' for e in events),exact_duplicate_call_payloads=duplicates,tool_input_characters=sum(map(len,inputs)),tool_output_characters=sum(len(json.dumps(e.get('output'),ensure_ascii=False)) for e in events if e['kind']=='tool_result'),assistant_visible_characters=sum(len(e['text']) for e in events if e['kind']=='assistant'),static_nested_exec_mentions=sum(len(re.findall(r'tools\.exec_command\s*\(',s)) for s in inputs))
    if measured:
        result['metrics']['uncached_input_tokens']=max(0,measured.get('input_tokens',0)-measured.get('cached_input_tokens',0))
    return result


def resolve_child(codex_home,parent,agent_path):
    candidates=sorted(codex_home.glob('state_*.sqlite'),key=lambda p:int(p.stem.split('_')[-1]),reverse=True)
    for database in candidates:
        connection=sqlite3.connect(f'file:{database}?mode=ro',uri=True)
        try:
            row=connection.execute('SELECT t.id,t.rollout_path FROM threads t JOIN thread_spawn_edges e ON e.child_thread_id=t.id WHERE e.parent_thread_id=? AND t.agent_path=? ORDER BY t.created_at DESC LIMIT 1',(parent,agent_path)).fetchone()
            if row:return row
        except sqlite3.OperationalError:
            continue
        finally:
            connection.close()
    raise ValueError(f'No child metadata found for {agent_path}')


def capture(codex_home,parent,agent_path):
    thread_id,rollout=resolve_child(codex_home,parent,agent_path)
    path=Path(rollout)
    records=[]
    for line in path.read_text().splitlines():
        try:records.append(json.loads(line))
        except json.JSONDecodeError:continue
    result=normalize(records)
    result['provenance']=dict(thread_id=thread_id,agent_path=agent_path,rollout_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--parent',required=True);p.add_argument('--agent',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--codex-home',type=Path,default=Path.home()/'.codex')
    a=p.parse_args();result=capture(a.codex_home,a.parent,a.agent);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['usage','usage_source','complete','metrics']}))
