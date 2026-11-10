"""Prepare matched fresh-agent tasks; the host agent executes launch.json with spawn_agent."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from fixture import build


def skill_digest(skill):
    paths=[skill/'SKILL.md',*(skill/'references').glob('*.md')]
    return hashlib.sha256(''.join(str(p.relative_to(skill))+'\n'+p.read_text() for p in sorted(paths)).encode()).hexdigest()


def prepare(root,skill,parent):
    cases=json.loads((skill/'evals/cases.json').read_text())
    root.mkdir(parents=True,exist_ok=False)
    snapshot=root/'skill-snapshot';snapshot.mkdir()
    shutil.copy2(skill/'SKILL.md',snapshot/'SKILL.md');shutil.copytree(skill/'references',snapshot/'references')
    jobs=[]
    for case in cases['cases']:
        for condition in cases['conditions']:
            work=root/(case['id']+'-'+condition);build(work,case['id'])
            treatment=f"Use $home-lab-workflow at {snapshot/'SKILL.md'}." if condition=='skill' else 'Control condition: do not load or use home-lab-workflow or its references. Use the provided environment and tools directly. This restriction applies to this controlled run.'
            prompt=f'''You are a task-performing agent in a controlled evaluation. Complete the task independently. Do not evaluate yourself or delegate.

{treatment}

Task: {case['task']}

Your isolated workspace is {work}. Start with context.json and TOOLING.md there. Use its fixture tools in place of the machine-global installation. Mutate only this workspace, excluding tools/ and scenario evidence/context. Native read-only host/account checks are permitted. Read the supplied skill references only in the skill condition. Do not inspect other runs, real hosting, real service state, histories, or evaluation criteria. Do not use real network URLs, live hosting scripts, sudo, or configuration changes. Tool observations are explicitly simulated. For report cases, the prepared bundle is already designed; this is a delivery task.'''
            jobs.append(dict(case=case['id'],condition=condition,task_name='eval_'+case['id'].replace('-','_')+'_'+condition,fork_turns='none',prompt=prompt))
    manifest=dict(schema=1,parent_thread_id=parent,skill_sha256=skill_digest(skill),fixture_sha256=hashlib.sha256((skill/'evals/fixture.py').read_bytes()).hexdigest(),case_sha256=hashlib.sha256((skill/'evals/cases.json').read_bytes()).hexdigest(),design='one fresh sample per task and condition; no-load catalog-visible control',jobs=jobs)
    (root/'launch.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);p.add_argument('--parent',required=True);a=p.parse_args();m=prepare(a.directory,Path(__file__).resolve().parents[1],a.parent);print(f"Prepared {len(m['jobs'])} fresh-agent jobs in {a.directory/'launch.json'}")
