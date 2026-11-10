"""Fault-injection fixtures. All injected operations remain inside the temporary task root."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
from fixture import build


DISPATCH = r'''import contextlib,io,json,runpy,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
context=json.loads((root/'context.json').read_text());case=context['case'];op=sys.argv[1];args=sys.argv[2:]
state=root/'store/state'
def emit(value,code=0):
 with (root/'command-events.jsonl').open('a') as stream:stream.write(json.dumps({'operation':op,'arguments':args,'simulated':True,'fault_case':case})+'\n')
 print(json.dumps(dict(simulated=True,**value)));sys.exit(code)
if op=='identity':emit(context['execution_target'])
if context['execution_target']['hostname']!='home-lab' and op in ['publish-report','start-preview','stop-preview','delete-report']:
 emit({'error':'Wrong execution host. Refusing local hosting mutation.','target':context['execution_target']},2)
if op=='diagnose' and args==['--help']:emit({'usage':'diagnose.sh: simulated local, route, and privilege observations'})
if op=='diagnose':
 observations=json.loads((root/'observations.json').read_text());emit(observations)
if op=='check-url' and args[0].startswith('http://127.0.0.1:8379/'):
 from urllib.parse import urlsplit
 parts=urlsplit(args[0]).path.strip('/').split('/')
 if parts and parts[0]=='reports':parts=parts[1:]
 target=(root/'store/public'/('/'.join(parts) or 'index.html')).resolve()
 if target.is_dir():target=target/'index.html'
 code=200 if target.is_relative_to(root/'store/public') and target.is_file() else 404
 emit({'url':args[0],'http_status':code,'transport':'loopback-http'},0 if code==200 else 4)
if case=='verification-failure' and op=='check-url' and '/assets/evidence.txt' in args[0]:
 emit({'url':args[0],'http_status':503,'error':'Companion request failed at the upstream; local file exists'},22)
if case=='concurrent-edit' and op=='publish-report' and '--help' not in args and not (state/'race-injected').exists():
 db=json.loads((state/'reports.json').read_text());record=db['261105_stack-effect_graph-review'];record['revision']='revision-winning';record['title']='Graph review, newer author revision'
 (state/'reports.json').write_text(json.dumps(db,indent=2));(state/'race-injected').write_text('Injected one competing writer.\n')
 (root/'store/public'/record['id']/'index.html').write_text('<!doctype html><h1>Graph review</h1><p>A newer author approved 14 groups. Preserve this until the conflicting 12-group correction is resolved.</p>')
if case=='missing-privileges' and op=='check-url' and args[0].startswith('https://fixture.example.invalid/reports/'):emit({'http_status':503,'error':'No report HTTPS route is installed'},22)
if case=='corrupt-allocation' and op=='start-preview' and '--help' not in args:
 emit({'error':'Allocation registry is invalid; refusing to allocate or reuse URLs. Preserve the records for repair.','record':'broken.json'},1)
if case=='allocation-exhaustion' and op=='start-preview' and '--help' not in args:
 db=json.loads((state/'previews.json').read_text())
 if not any(r['worktree']==args[0] and r['service']==args[1] and r['status']!='retired' for r in db):
  emit({'error':'HTTPS allocation range exhausted. Retired URLs must not be recycled.','configured_https_range':[8400,8402],'retired_allocations':3},1)
if case=='missing-privileges' and op=='publish-report' and '--help' not in args:
 captured=io.StringIO()
 with contextlib.redirect_stdout(captured):runpy.run_path(str(root/'tools/_base.py'),run_name='__main__')
 record=json.loads(captured.getvalue());record.pop('url',None);record['delivery']='pending';record['error']='Local report saved; route helper unavailable and sudo requires a password'
 db=json.loads((state/'reports.json').read_text());db[record['id']]['delivery']='pending';(state/'reports.json').write_text(json.dumps(db,indent=2))
 print(json.dumps(record));sys.exit(1)
runpy.run_path(str(root/'tools/_base.py'),run_name='__main__')
'''


def prepare(work,case):
    context=build(work,case)
    tools=work/'tools';(tools/'simulate.py').rename(tools/'_base.py');(tools/'simulate.py').write_text(DISPATCH)
    for op in ['identity','diagnose']:
        p=tools/(op+'.sh');p.write_text('#!/usr/bin/env bash\nset -euo pipefail\nexec python3 "$(dirname -- "$0")/simulate.py" '+op+' "$@"\n');p.chmod(0o755)
    context['execution_target']={'hostname':'home-lab','account':'coder','os':'Linux'}
    if case=='wrong-host':context['execution_target']={'hostname':'lloyd-macbook','account':'lloyd','os':'Darwin'}
    context['remote_worktree']='/home/coder/projects/stack-effect'
    context['observations']=str(work/'observations.json')
    (work/'context.json').write_text(json.dumps(context,indent=2))
    observations={'local_report_service':'active','loopback_http_status':200,'report_route_installed':True,'administrator_helper_available':True,'host':'home-lab','coding_account':'coder','maintenance_account':'lloyd'}
    if case=='missing-privileges':observations.update(report_route_installed=False,administrator_helper_available=False,remaining_command='sudo bash /home/coder/projects/proj_home-lab/tools/publishing/install-admin.sh',command_host='home-lab',command_account='lloyd',sudo_password_required=True)
    if case=='verification-failure':observations.update(canonical_http_status=200,companion_http_status=503,local_companion_exists=True)
    (work/'observations.json').write_text(json.dumps(observations,indent=2))
    if case in ['allocation-exhaustion','wrong-host','corrupt-allocation']:
        subprocess.run(['git','-C',str(work/'repository'),'worktree','add','-q','--detach',str(work/'worktrees/review')],check=True)
        (work/'worktrees/review/package.json').write_text(json.dumps({'scripts':{'dev':'vite --host 127.0.0.1'}}))
        context['worktrees']['review']=str(work/'worktrees/review');(work/'context.json').write_text(json.dumps(context,indent=2))
    if case=='allocation-exhaustion':
        p=work/'store/state/previews.json';records=json.loads(p.read_text())
        for port in range(8400,8403):records.append(dict(id=f'retired-{port}',worktree=str(work/'old-worktree'),service='retired',status='retired',external_port=port,internal_port=22000+port-8400,url=f'https://fixture.example.invalid:{port}/',simulated=True))
        p.write_text(json.dumps(records,indent=2))
    if case=='corrupt-allocation':
        (work/'store/state/broken.json').write_text('{broken reservation')
    (work/'TOOLING.md').write_text((work/'TOOLING.md').read_text()+'''\nFor these target-execution fixtures, context.json defines the simulated execution target. tools/identity.sh confirms that target identity; the native runner hostname is not the target identity. tools/diagnose.sh provides simulated loopback, route, and administrative observations. Use them instead of live systemctl, sudo, or real network commands. The check-url tool also supports simulated loopback HTTP at http://127.0.0.1:8379/. Existing administrative command examples in observations are instructions for the user, not permission to run global commands during this task.\n''')
    return context


def batch(root,skill):
    root.mkdir(parents=True,exist_ok=False);snapshot=root/'skill-snapshot';snapshot.mkdir()
    shutil.copy2(skill/'SKILL.md',snapshot/'SKILL.md');shutil.copytree(skill/'references',snapshot/'references')
    cases=json.loads((skill/'evals/failure-cases.json').read_text());jobs=[]
    for case in cases['cases']:
        work=root/case['id'];prepare(work,case['id'])
        prompt=f'''Complete this task independently as a task-performing evaluation agent. Do not evaluate yourself, inspect scoring criteria, or delegate.

Use $home-lab-workflow at {snapshot/'SKILL.md'}.

Task: {case['task']}

Workspace: {work}. Begin with context.json and TOOLING.md. Use fixture tools in place of machine-global hosting tools. The fixture defines the simulated execution target; tools/identity.sh observes it. Native runner identity is not the target identity. All network, service, and administrative observations must come from fixture tools. Mutate only this workspace, excluding tools/, context.json, and observations.json. Do not inspect other runs, real hosting or service state, histories, or evaluation criteria. Do not use real networking, sudo, global configuration changes, or reboot commands. Prepared reports are already designed; this is a delivery task. All hosting observations are explicitly simulated.'''
        jobs.append(dict(id=case['id'],prompt=prompt,fork_turns='none'))
    (root/'launch.json').write_text(json.dumps(dict(schema=1,cases=cases,jobs=jobs),indent=2)+'\n')
    return jobs


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);a=p.parse_args();jobs=batch(a.directory,Path(__file__).resolve().parents[1]);print('Prepared',len(jobs),'fault-injection tasks')
