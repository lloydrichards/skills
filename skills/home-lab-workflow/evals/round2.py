"""Freeze a candidate and prepare a repeated, matched baseline/candidate batch."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from fixture import build
from plan import skill_digest


def prepare(root,skill,parent):
    if not (root/'baseline/SKILL.md').is_file():raise ValueError('Freeze the previous skill under RUN/baseline before editing')
    candidate=root/'candidate';candidate.mkdir()
    shutil.copy2(skill/'SKILL.md',candidate/'SKILL.md');shutil.copytree(skill/'references',candidate/'references')
    cases=json.loads((skill/'evals/round2-cases.json').read_text());jobs=[]
    for case in cases['cases']:
        for repetition in range(1,case['repetitions']+1):
            for condition in ['baseline','candidate']:
                name=f"{case['id']}-{condition}-{repetition}";work=root/name;build(work,case['id'])
                prompt=f'''Complete this task independently as a task-performing evaluation agent. Do not evaluate yourself, inspect scoring criteria, or delegate.

Use $home-lab-workflow at {root/condition/'SKILL.md'}.

Task: {case['task']}

Workspace: {work}. Begin with context.json and TOOLING.md. Use only this workspace's fixture hosting tools in place of the machine-global installation. Mutate only this workspace, excluding tools/ and scenario evidence/context. Native read-only host/account checks and the supplied skill references are permitted. The local Git worktrees are real fixtures. Do not inspect other runs, real hosting, real service state, histories, or evaluation criteria. Do not use real network URLs, live hosting scripts, sudo, or global configuration changes. Tool observations are explicitly simulated. Prepared reports are already designed; report tasks are delivery tasks.'''
                jobs.append(dict(id=name,case=case['id'],condition=condition,repetition=repetition,fork_turns='none',prompt=prompt))
    manifest=dict(schema=1,parent_thread_id=parent,conditions={c:skill_digest(root/c) for c in ['baseline','candidate']},fixture_sha256=hashlib.sha256((skill/'evals/fixture.py').read_bytes()).hexdigest(),cases=cases,jobs=jobs)
    (root/'launch.json').write_text(json.dumps(manifest,indent=2)+'\n');return manifest


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);p.add_argument('--parent',required=True);a=p.parse_args();m=prepare(a.directory,Path(__file__).resolve().parents[1],a.parent);print(f"Prepared {len(m['jobs'])} jobs")
