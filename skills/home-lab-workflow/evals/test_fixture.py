import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('fixture.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)


class FixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)/'task';fixture.build(self.root,'mac-dns')
    def tearDown(self):self.temp.cleanup()
    def tool(self,name,*args):
        return subprocess.run(['bash',str(self.root/'tools'/name),*args],capture_output=True,text=True)
    def test_revision_conflict_does_not_overwrite_winning_record(self):
        source=str(self.root/'prepared')
        result=self.tool('publish-report.sh','--source',source,'--project','stack-effect','--name','graph-review','--title','Review','--id','261105_stack-effect_graph-review','--expected-revision','stale')
        self.assertEqual(result.returncode,3)
        data=json.loads((self.root/'store/state/reports.json').read_text())
        self.assertEqual(data['261105_stack-effect_graph-review']['revision'],'revision-original')
    def test_reuse_preserves_the_main_preview(self):
        before=(self.root/'store/state/previews.json').read_text()
        result=self.tool('start-preview.sh',str(self.root/'worktrees/feature'),'docs','--','fixture-command')
        self.assertEqual(result.returncode,0)
        self.assertEqual(json.loads(result.stdout)['id'],'feature-docs')
        self.assertEqual((self.root/'store/state/previews.json').read_text(),before)
    def test_help_is_not_a_preview_lookup(self):
        result=self.tool('preview-status.sh','--help')
        self.assertEqual(result.returncode,0)
        self.assertIn('PREVIEW_ID',result.stdout)
    def test_client_probe_retains_failure_and_simulation_scope(self):
        result=self.tool('check-url.sh','https://fixture.example.invalid:8444/','--from-client','mac')
        self.assertEqual(result.returncode,6)
        self.assertTrue(json.loads(result.stdout)['simulated'])

    def test_unknown_companion_url_does_not_report_success(self):
        result=self.tool('check-url.sh','https://fixture.example.invalid/reports/261105_stack-effect_graph-review/missing.csv')
        self.assertEqual(result.returncode,4)
        self.assertEqual(json.loads(result.stdout)['http_status'],404)
    def test_existing_report_files_are_seeded(self):
        result=self.tool('check-url.sh','https://fixture.example.invalid/reports/261105_stack-effect_graph-review/')
        self.assertEqual(result.returncode,0)
        self.assertTrue((self.root/'store/public/261104_stack-effect_benchmark-review/index.html').is_file())
    def test_dns_bypass_requires_the_actual_https_port(self):
        result=self.tool('check-url.sh','https://fixture.example.invalid:8444/','--from-client','mac','--resolve','fixture.example.invalid:443:100.100.0.42')
        self.assertNotEqual(result.returncode,0)
    def test_healthy_report_task_does_not_inject_a_mac_dns_failure(self):
        context=json.loads((self.root/'context.json').read_text());context['case']='report-preservation'
        (self.root/'context.json').write_text(json.dumps(context))
        result=self.tool('check-url.sh','https://fixture.example.invalid:8444/','--from-client','mac')
        self.assertEqual(result.returncode,0)
    def test_cleanup_case_has_real_dirty_git_state_and_unfinished_review(self):
        other=Path(self.temp.name)/'cleanup';fixture.build(other,'cleanup-pending-review')
        task=json.loads((other/'task-status.json').read_text())
        self.assertFalse(task['task']['finished'])
        result=subprocess.run(['git','-C',str(other/'worktrees/feature'),'status','--porcelain'],check=True,capture_output=True,text=True)
        self.assertIn('README.md',result.stdout)
        self.assertIn('?? review-notes.txt',result.stdout)


if __name__=='__main__':unittest.main()
