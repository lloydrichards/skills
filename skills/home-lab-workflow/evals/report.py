"""Build a report and readable trace viewers from reviewed conversation exports."""
import argparse
from collections import Counter
import difflib
from html import escape as esc
import json
from pathlib import Path
import shutil


def readable(value):
    if isinstance(value,str):
        try:return readable(json.loads(value))
        except (ValueError,TypeError):return value
    if isinstance(value,list):return '\n\n'.join(readable(x) for x in value)
    if isinstance(value,dict):
        if 'text' in value:return readable(value['text'])
        if 'output' in value:
            return f"exit_code={value.get('exit_code','unknown')}\n"+readable(value['output'])
    return json.dumps(value,indent=2,ensure_ascii=False)


def page(scaffold,title,body):
    start=scaffold.index('    <header class="report-header">');end=scaffold.index('  </main>',start)
    output=scaffold[:start]+body+'\n'+scaffold[end:]
    return output.replace('{{REPORT_TITLE}}',esc(title)).replace('{{DATE}}','10 November 2026')


def header(title,lede,kind='Conversation audit'):
    return f'<header class="report-header"><p class="eyebrow">{kind}</p><h1 class="display-1">{esc(title)}</h1><p class="lede">{lede}</p></header>'


def write_viewers(traces,out,scaffold):
    (out/"traces").mkdir(parents=True,exist_ok=True)
    for key,d in traces.items():
        (out/'traces'/(key+'.json')).write_text(json.dumps(d,indent=2)+'\n')
        body=header(key,'Visible messages and tool activity. Tool results are expandable. System/developer instructions and hidden reasoning content are excluded.','Conversation trace')
        body+='<p><a href="../index.html">Evaluation report</a> · <a href="'+key+'.json">Download normalized JSON</a></p>'
        body+='<p><label for="search">Search this conversation</label><br><input id="search" type="search"></p><p><label for="kind">Event type</label> <select id="kind"><option value="">All events</option><option>tool_call</option><option>tool_result</option><option>assistant</option><option>user</option></select></p><p id="count" role="status"></p>'
        for e in d['events']:
            text=readable(e.get('input',e.get('output',e.get('text',''))))
            label=e['id']+' · '+e['kind']+(' · '+str(e.get('name','')) if e['kind']=='tool_call' else '')
            content=f'<pre><code class="nohighlight">{esc(text)}</code></pre>'
            if e['kind']=='tool_result':content='<details><summary>Tool result · '+str(len(text))+' characters</summary>'+content+'</details>'
            body+=f'<section id="{e["id"]}" data-event data-kind="{e["kind"]}"><h2 class="heading-2">{esc(label)}</h2>{content}</section>'
        body+='''<script>const search=document.querySelector('#search'),kind=document.querySelector('#kind');function filter(){let n=0;for(const e of document.querySelectorAll('[data-event]')){e.hidden=!(e.textContent.toLowerCase().includes(search.value.toLowerCase())&&(!kind.value||e.dataset.kind===kind.value));if(!e.hidden)n++}document.querySelector('#count').textContent=n+' events'}search.addEventListener('input',filter);kind.addEventListener('change',filter);filter();</script>'''
        (out/'traces'/(key+'.html')).write_text(page(scaffold,key,body))


def build(run,out,scaffold):
    out.mkdir(parents=True,exist_ok=True);(out/'traces').mkdir(exist_ok=True);(out/'data').mkdir(exist_ok=True)
    traces={p.stem:json.loads(p.read_text()) for p in (run/'traces').glob('*.json')}
    review=json.loads((run/'review.json').read_text());heldout=json.loads((run/'heldout-review.json').read_text())
    write_viewers(traces,out,scaffold)
    totals={condition:Counter() for condition in ['skill','control']}
    for d in traces.values():
        if d['case'] not in ['revise-report','reuse-preview','mac-dns']:continue
        totals[d['condition']].update(d['usage']);totals[d['condition']]['uncached_input_tokens']+=d['metrics']['uncached_input_tokens'];totals[d['condition']]['tool_calls']+=d['metrics']['tool_calls']
    metrics={key:dict(case=d['case'],condition=d['condition'],usage=d['usage'],metrics=d['metrics'],duration_ms=d['duration_ms']) for key,d in traces.items()}
    (out/'data/metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
    for name in ['review.json','heldout-review.json','regression-review.json','manifest.json','held-out-case.json']:
        if (run/name).exists():shutil.copy2(run/name,out/'data'/name)
    for version in ['original','revised','final']:
        if (run/('skill-'+version)).exists():shutil.copytree(run/('skill-'+version),out/'data'/('skill-'+version),dirs_exist_ok=True)
    original=(run/'skill-original/SKILL.md').read_text();final=(run/'skill-final/SKILL.md').read_text()
    diff=''.join(difflib.unified_diff(original.splitlines(True),final.splitlines(True),fromfile='original/SKILL.md',tofile='final/SKILL.md'))
    original=(run/'skill-original/references/reports.md').read_text();final=(run/'skill-final/references/reports.md').read_text()
    diff+=''.join(difflib.unified_diff(original.splitlines(True),final.splitlines(True),fromfile='original/reports.md',tofile='final/reports.md'))
    (out/'data/skill-changes.diff').write_text(diff)
    body=header('Home-lab skill conversation evaluation','The skill added useful operational guidance, but the first version did not produce a general token-efficiency win. A narrower revision helped one held-out task; a verification mistake needed a separate correction.')
    body+='''<aside class="orientation" aria-label="Audit scope"><div class="summary-card"><b>Sample</b><span>9 fresh task agents; 8 independently reviewed, plus one author-reviewed regression.</span></div><div class="summary-card"><b>Primary evidence</b><span>Visible conversation, ordered tool calls/results, native token usage.</span></div><div class="summary-card warning"><b>Confidence</b><span>Exploratory fixtures, one sample per condition. No production or statistical certification.</span></div></aside>
<nav class="toc" aria-label="On this page"><strong>On this page</strong><a href="#method">Method</a><a href="#tokens">Token cost</a><a href="#process">Process findings</a><a href="#revision">Revision and retest</a><a href="#traces">Conversations</a><a href="#limits">Limits</a><a href="#next">Decision</a></nav>
<section id="method"><h2 class="heading-1">Compare process before comparing cost</h2><p>Three tasks were paired across the original skill and a control instructed not to load it: report revision, existing-preview reuse, and Mac DNS diagnosis. Agents started without the parent conversation and received the same task goals and fixture tooling guide. No model overrides were applied. A fresh reviewer scored evidence before action, tool selection, verification/claim discipline, scope/lifecycle, and focus, using event-id citations.</p><p>All hosting operations ran in isolated simulations. The experiment graded whether agents chose and interpreted the right checks, not whether a fake browser flag proved real browser functionality. Controls still had the skill catalog entry, and the tooling guide supplied useful interface knowledge. This measures marginal value beyond that guide, not complete skill isolation.</p><p>Native traces were resolved through parent-child metadata. Per-response usage was deduplicated by response id. Hidden reasoning content, system messages, developer messages, and unrelated histories were not exported. <a href="data/manifest.json">Run provenance</a> · <a href="data/review.json">Independent first-batch review</a>.</p></section>
<section id="tokens"><h2 class="heading-1">The first batch cost more uncached input</h2><p>Across three matched pairs, skill runs used 23,348 uncached input tokens versus 17,791 in controls, about 31% more. They used 14 outer tool calls versus 15. Fewer outer calls did not mean less work or less context. The following counts include skill loading and common instructions, with repeated cached response contexts counted by the provider.</p>'''
    body+='<div class="table-scroll" tabindex="0" role="region" aria-label="Initial token totals"><table><caption>Original skill batch, three runs per condition</caption><thead><tr><th scope="col">Condition</th><th scope="col">Input</th><th scope="col">Cached input</th><th scope="col">Uncached input</th><th scope="col">Output</th><th scope="col">Tool calls</th></tr></thead><tbody>'
    for c in ['control','skill']:
        t=totals[c];body+='<tr><th scope="row">'+c+'</th>'+''.join('<td>'+f'{t[k]:,}'+'</td>' for k in ['input_tokens','cached_input_tokens','uncached_input_tokens','output_tokens','tool_calls'])+'</tr>'
    body+='</tbody></table></div><p>Tool-output volume was 69,712 characters for skill runs versus 41,031 for controls. Loading relevant guidance has a real cost. Token counts are not prices; cache state was uncontrolled. These subject-run totals exclude the parent orchestrator, instrumentation agent, and reviewers. <a href="data/metrics.json">Per-run native measurements</a>.</p></section>'
    body+='''<section id="process"><h2 class="heading-1">Useful differences were specific, not universal</h2><p>The independent reviewer found no critical failures in the first six runs. Both conditions protected report identities and existing services and labeled simulated checks. The controls already solved most of the operational tasks.</p><ul>
<li>The skill report run requested the companion file through its HTTPS URL. Its control compared local file bytes and used a broad browser flag instead. <a href="traces/revise-report-skill.html#e0011">Skill verification</a> · <a href="traces/revise-report-control.html#e0013">Control verification</a>.</li>
<li>The skill DNS run supplied an exact Mac diagnostic using the preview port and preserved TLS verification. The control performed a simulated bypass but ended with more general resolver advice. <a href="traces/mac-dns-skill.html#e0011">Skill next step</a> · <a href="traces/mac-dns-control.html#e0011">Control next step</a>.</li>
<li>Both report runs read unrelated Mac observations. Several agents read the whole simulator even though the task used one operation. The preview skill run issued many small sequential shell calls despite the same five outer calls as its control. <a href="traces/revise-report-skill.html#e0005">Unrelated context</a> · <a href="traces/reuse-preview-skill.html#e0005">Small sequential calls</a>.</li></ul>
<p>Reviewer scores are audit judgments rather than an objective skill grade. A control DNS help probe was penalized partly because the initial simulator returned an empty lookup for --help. That fixture behavior limits the meaning of the small score difference. See the full review for dimensions and evidence.</p></section>
<section id="revision"><h2 class="heading-1">A held-out run improved focus but exposed a bad check</h2><p>The first revision directs agents to documented interfaces before implementation code, keeps investigation on the current service or report, and routes client DNS diagnosis to troubleshooting guidance. A new-report task then used fresh agents and a frozen revised skill snapshot.</p>'''
    body+='<div class="table-scroll" tabindex="0" role="region" aria-label="Held-out measurements"><table><caption>Held-out new-report task, one sample per condition</caption><thead><tr><th scope="col">Condition</th><th scope="col">Uncached input</th><th scope="col">Output tokens</th><th scope="col">Outer calls</th><th scope="col">Duration</th></tr></thead><tbody>'
    for c in ['control','skill']:
        d=traces['new-report-'+c];body+=f'<tr><th scope="row">{c}</th><td>{d["metrics"]["uncached_input_tokens"]:,}</td><td>{d["usage"]["output_tokens"]:,}</td><td>{d["metrics"]["tool_calls"]}</td><td>{d["duration_ms"]/1000:.1f} s</td></tr>'
    body+='''</tbody></table></div><p>The skill run used 5 calls versus 7, and 7,138 uncached input tokens versus 7,399. This is a directional observation on a different task, not a controlled estimate of the revision’s causal effect.</p>
<p>Its preservation check hashed the shared registry, which publication was supposed to change. The checksum failed and was not reconciled in the final conversation. The independent held-out reviewer reduced verification/claim discipline for that reason. <a href="traces/new-report-skill.html#e0011">Failed verification and result</a> · <a href="data/heldout-review.json">Held-out review</a>.</p>
<p>The final report reference clarifies record-level preservation and requires investigating failed checks. A fresh regression agent compared the individual benchmark record, original report URL, and creation date, then checked the canonical URL and companion. The author reviewed this trace; it was not an independently scored matched pair. The targeted checks passed in the visible tool result, but the agent still inspected the simulator after encountering metadata without old bundle files. <a href="traces/report-preservation-skill.html#e0011">Regression checks</a> · <a href="data/regression-review.json">Author’s evidence note</a> · <a href="data/skill-changes.diff">Exact skill changes</a>.</p></section>'''
    body+='<section id="traces"><h2 class="heading-1">Inspect the actual conversations</h2><p>Each viewer supports event search and filtering. Tool calls stay visible; results expand on demand. Event links in the findings point to the underlying evidence.</p><ul>'
    for key in sorted(traces):body+=f'<li><a href="traces/{key}.html">{esc(key)}</a> · <a href="traces/{key}.json">JSON</a></li>'
    body+='''</ul></section><section id="limits"><h2 class="heading-1">These results do not certify the whole skill</h2><ul>
<li>One run per condition and task, no randomized repeated trials, and uncontrolled cache state. Do not infer significance, model-wide superiority, or monetary savings.</li>
<li>Controls were catalog-visible and instructed not to load the target skill. Review found no target-skill reads in the controls; this is not technical isolation.</li>
<li>Fixture tools returned simulated browser/API/live-update flags. These measure tool selection and claims, not real hosting correctness.</li>
<li>Initial fixtures included irrelevant DNS observations in report tasks and report metadata without old published files. These encouraged some detours. Framework changes after the initial runs do not retroactively change their evidence.</li>
<li>Dirty-worktree cleanup, wrong-host activation, concurrent author conflicts, unavailable privileges, and retired-URL exhaustion are not covered by these task-agent runs.</li>
<li>The final targeted regression is author-reviewed. The two earlier reviews were independent, but all judgments need human scrutiny.</li></ul></section>
<section id="next"><h2 class="heading-1">Keep the guardrails; continue measuring their cost</h2><p>The sampled conversations support keeping the skill’s stable-link, scope, verification, and client/server distinctions. They do not establish that the skill is generally more efficient than a capable agent with a tooling guide. The final version includes narrow corrections supported by observed traces.</p><p>The framework now provides isolated cases, fresh-agent launch plans, frozen snapshots, native trace/token extraction, a process rubric, synthetic tests, and readable conversation exports. Future batches should add repeated samples and the uncovered lifecycle cases, with realistic fixture state and a genuinely isolated control where the host permits it. Framework source is maintained under skills/home-lab-workflow/evals; reports and traces remain outside Git.</p></section>'''
    (out/'index.html').write_text(page(scaffold,'Home-lab skill conversation evaluation',body))
    return out


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('run',type=Path);p.add_argument('output',type=Path);p.add_argument('--scaffold',type=Path,required=True);a=p.parse_args();print(build(a.run,a.output,a.scaffold.read_text()))
