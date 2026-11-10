"""Present matched-version conversation findings without treating token noise as a win."""
import argparse
from collections import Counter
import difflib
from html import escape as esc
import json
from pathlib import Path
import shutil
from report import header,page,write_viewers


def build(run,out,scaffold):
    out.mkdir(parents=True,exist_ok=True);(out/'data').mkdir(exist_ok=True)
    traces={p.stem:json.loads(p.read_text()) for p in (run/'traces').glob('*.json')}
    review=json.loads((run/'review.json').read_text())
    write_viewers(traces,out,scaffold)
    for name in ['launch.json','review.json','improvement-plan.json']:
        shutil.copy2(run/name,out/'data'/name)
    for version in ['baseline','candidate']:
        shutil.copytree(run/version,out/'data'/version,dirs_exist_ok=True)
    diff=''
    for name in ['SKILL.md','references/reports.md']:
        before=(run/'baseline'/name).read_text();after=(run/'candidate'/name).read_text()
        diff+=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='baseline/'+name,tofile='candidate/'+name))
    (out/'data/changes.diff').write_text(diff)
    totals={c:Counter() for c in ['baseline','candidate']}
    for d in traces.values():
        t=totals[d['condition']];t.update(d['usage']);t.update({k:d['metrics'][k] for k in ['tool_calls','uncached_input_tokens','tool_output_characters']})
    (out/'data/totals.json').write_text(json.dumps(totals,indent=2)+'\n')
    body=header('Home-lab skill evaluation, round 2','The shorter skill preserved the observed behavior, but this matched round did not demonstrate a consistent efficiency advantage. Keep the clarity improvements without claiming token savings.')
    body+='''<aside class="orientation" aria-label="Round 2 findings"><div class="summary-card"><b>Skill entrypoint</b><span>582 → 419 words, 28% shorter.</span></div><div class="summary-card"><b>Process review</b><span>8 fresh runs. Both versions met the observed criteria; no critical failures.</span></div><div class="summary-card warning"><b>Efficiency</b><span>19 tool calls per version. Token results mixed and cache-sensitive.</span></div></aside>
<nav class="toc" aria-label="On this page"><strong>On this page</strong><a href="#changes">Improvements</a><a href="#design">Test design</a><a href="#results">Measurements</a><a href="#behavior">Conversation evidence</a><a href="#cache">Cache effects</a><a href="#decision">Decision</a><a href="#traces">Traces</a></nav>
<section id="changes"><h2 class="heading-1">Reduce routing overhead and keep checks relevant</h2><p>The baseline is the final installed skill from round 1, including its earlier preservation-check correction. Both versions were frozen before testing. The candidate shortens the entrypoint and retains lifecycle and permission boundaries.</p><ul>
<li>A task table routes report delivery, preview lifecycle, and client diagnosis to one relevant reference.</li>
<li>Reports require canonical HTML and relevant companions. Previews require the APIs, assets, deep links, and live updates they actually use. Healthy tasks do not trigger unsolicited Mac diagnostics.</li>
<li>A prepared report uses delivery guidance without another design workflow. Implementation inspection needs a concrete unresolved question.</li>
<li>Required failed checks block readiness claims. Expected diagnostic failures remain evidence of a problem.</li>
<li>The report reference includes a complete revision example and explicitly scopes preservation to unrelated records and files.</li></ul><p><a href="data/changes.diff">Inspect the exact skill diff</a> · <a href="data/baseline/SKILL.md">Frozen baseline</a> · <a href="data/candidate/SKILL.md">Frozen candidate</a>.</p></section>
<section id="design"><h2 class="heading-1">Use the same tasks for both skill versions</h2><p>Eight fresh task agents used either the baseline or candidate, with no parent conversation history and no model-setting overrides. Report preservation had two samples per version. DNS diagnosis and unfinished-task cleanup had one each. The second report pair reversed the launch order. A fresh reviewer graded visible conversations, tool calls, results, and claims under the existing rubric. Artifact quality was not scored.</p><p>The fixtures now contain real prior report files and real local Git worktrees. DNS failure is present only in the DNS task. Verification rejects unknown or missing report URLs and validates the port used in a TLS-preserving bypass. The cleanup task contains an unfinished review, a merged PR, and both modified and untracked files. All conditions used the same new fixtures, so this is a within-round comparison. It is not comparable to round 1 as a pure before/after metric.</p><p><a href="data/launch.json">Scenario definitions, prompts, and hashes</a> · <a href="data/review.json">Independent review with event citations</a>.</p></section>
<section id="results"><h2 class="heading-1">The matched measurements show no clear efficiency win</h2>'''
    body+='<div class="table-scroll" tabindex="0" role="region" aria-label="Aggregate usage"><table><caption>Four subject runs per version; orchestration and review excluded</caption><thead><tr><th scope="col">Version</th><th scope="col">Input</th><th scope="col">Cached input</th><th scope="col">Uncached input</th><th scope="col">Output</th><th scope="col">Outer calls</th><th scope="col">Tool-output characters</th></tr></thead><tbody>'
    for c in ['baseline','candidate']:
        body+='<tr><th scope="row">'+c+'</th>'+''.join('<td>'+f'{totals[c][k]:,}'+'</td>' for k in ['input_tokens','cached_input_tokens','uncached_input_tokens','output_tokens','tool_calls','tool_output_characters'])+'</tr>'
    body+='</tbody></table></div><p>The candidate had about 1.6% more total input, 1.3% less output, and the same outer call count. Its uncached input was higher, with a large single-response cache miss discussed below. These counts do not establish a monetary cost or speed advantage.</p>'
    body+='<div class="table-scroll" tabindex="0" role="region" aria-label="Per-run measurements"><table><caption>Individual runs, including both report repetitions</caption><thead><tr><th scope="col">Run</th><th scope="col">Calls</th><th scope="col">Uncached input</th><th scope="col">Output</th><th scope="col">Duration</th></tr></thead><tbody>'
    for key,d in sorted(traces.items()):
        body+=f'<tr><th scope="row"><a href="traces/{key}.html">{key}</a></th><td>{d["metrics"]["tool_calls"]}</td><td>{d["metrics"]["uncached_input_tokens"]:,}</td><td>{d["usage"]["output_tokens"]:,}</td><td>{d["duration_ms"]/1000:.1f} s</td></tr>'
    body+='''</tbody></table></div><p>The first report pair favored the candidate by one call, 6 → 5. The second reversed that result, 5 → 6. A single favorable run would have overstated the evidence. Exact duplicate call payloads were absent, but that alone does not prove all reads were useful.</p></section>
<section id="behavior"><h2 class="heading-1">Both versions retained the important operational behavior</h2><p>The independent reviewer scored both versions as satisfying the observed criteria. No unsupported readiness claim, unrelated overwrite, or premature cleanup was found. This supports the candidate as a smaller instruction set with no observed regression in these tasks; it does not demonstrate a quality advantage.</p><ul>
<li>All four report runs used the original identity and revision, checked the canonical and companion URLs, and compared the benchmark record and files separately. No whole-registry checksum mistake recurred. <a href="traces/report-preservation-baseline-1.html#e0013">Baseline checks</a> · <a href="traces/report-preservation-candidate-1.html#e0011">Candidate checks</a>.</li>
<li>Both DNS runs used port 8444 in a TLS-preserving bypass, retained the healthy preview, and scoped the final result to simulation. Neither claimed to identify the actual VPN cause. <a href="traces/mac-dns-baseline-1.html#e0011">Baseline diagnostic</a> · <a href="traces/mac-dns-candidate-1.html#e0011">Candidate diagnostic</a>.</li>
<li>Both cleanup runs read the unfinished task status and dirty Git state, then retained the previews, worktrees, and reports despite the merge. <a href="traces/cleanup-pending-review-baseline-1.html#e0007">Baseline evidence</a> · <a href="traces/cleanup-pending-review-candidate-1.html#e0007">Candidate evidence</a>.</li></ul><p>Routing and batching improved in some conversations, but inconsistently. Both DNS agents still combined allocation status with reading the registry, and both used interface discovery. The entrypoint text alone does not remove every extra read.</p></section>
<section id="cache"><h2 class="heading-1">A cache miss changed the apparent token outcome</h2><p>The candidate cleanup run used smaller input contexts and less tool-output text than its baseline, yet incurred more uncached tokens. Its third response had 22,518 input tokens and zero cached input. The baseline’s corresponding third response had 24,494 input tokens and 18,560 cached input. The input size and uncached cost therefore moved in opposite directions.</p><p>This explains why uncached totals need per-response context. It does not justify deleting the inconvenient run or claiming a hypothetical cache-adjusted saving. Ancillary writing-skill reads also varied between agents, adding another attribution limit. Native per-response usage is preserved in each downloadable trace. Reasoning-token counts are metadata only; reasoning content is not exported.</p></section>
<section id="decision"><h2 class="heading-1">Keep the shorter wording as a clarity improvement</h2><p>The candidate is easier to route and retains the safety and lifecycle requirements in the sampled conversations. Keep it for that reason. Do not describe it as a demonstrated token optimization: the repeated calls were tied overall, quality criteria were tied, and measured token costs were mixed.</p><p>The framework now supports matched skill versions, repeated report tasks, realistic prior files and Git state, task-specific client failures, URL validity checks, and per-response cache visibility. Synthetic checks cover these mechanics.</p><p>Further confidence requires more repetitions with balanced order and consistent auxiliary instructions. Useful next scenarios are a required verification failure, a concurrent report revision, missing route privileges, wrong-host activation, and retired-URL exhaustion. Those behaviors were not demonstrated by this batch. All hosting remained simulated, and neither production Mac access nor reboot recovery was tested here.</p></section>
<section id="traces"><h2 class="heading-1">Read the conversations</h2><p>Viewers support search, event-type filtering, and expandable tool results. Evidence links retain stable event ids.</p><ul>'''
    for key in sorted(traces):body+=f'<li><a href="traces/{key}.html">{esc(key)}</a> · <a href="traces/{key}.json">Native-usage JSON</a></li>'
    body+='</ul></section>'
    (out/'index.html').write_text(page(scaffold,'Home-lab skill evaluation, round 2',body))
    return out


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('run',type=Path);p.add_argument('output',type=Path);p.add_argument('--scaffold',type=Path,required=True);a=p.parse_args();print(build(a.run,a.output,a.scaffold.read_text()))
