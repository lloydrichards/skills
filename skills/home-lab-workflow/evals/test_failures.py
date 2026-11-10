import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from failures import prepare


class FailureFixtures(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)/'task'
    def tearDown(self):self.temp.cleanup()
    def tool(self,name,*args):return subprocess.run(['bash',str(self.root/'tools'/(name+'.sh')),*args],capture_output=True,text=True)
    def publish(self):return self.tool('publish-report','--source',str(self.root/'prepared'),'--project','stack-effect','--name','graph-review','--title','Graph review','--id','261105_stack-effect_graph-review','--expected-revision','revision-original')
    def test_companion_failure_does_not_invalidate_healthy_canonical_probe(self):
        prepare(self.root,'verification-failure');self.assertEqual(self.publish().returncode,0)
        self.assertEqual(self.tool('check-url','https://fixture.example.invalid/reports/261105_stack-effect_graph-review/').returncode,0)
        result=self.tool('check-url','https://fixture.example.invalid/reports/261105_stack-effect_graph-review/assets/evidence.txt')
        self.assertEqual(result.returncode,22);self.assertEqual(json.loads(result.stdout)['http_status'],503)
    def test_race_preserves_new_winner_and_original_draft(self):
        prepare(self.root,'concurrent-edit');before=(self.root/'prepared/index.html').read_bytes();result=self.publish()
        self.assertEqual(result.returncode,3)
        db=json.loads((self.root/'store/state/reports.json').read_text())
        self.assertEqual(db['261105_stack-effect_graph-review']['revision'],'revision-winning')
        self.assertEqual((self.root/'prepared/index.html').read_bytes(),before)
    def test_privilege_failure_separates_loopback_success_from_https_failure(self):
        prepare(self.root,'missing-privileges');result=self.publish();self.assertEqual(result.returncode,1)
        self.assertEqual(json.loads(result.stdout)['delivery'],'pending')
        self.assertEqual(self.tool('check-url','http://127.0.0.1:8379/reports/261105_stack-effect_graph-review/').returncode,0)
        self.assertEqual(self.tool('check-url','https://fixture.example.invalid/reports/261105_stack-effect_graph-review/').returncode,22)
    def test_wrong_target_guard_refuses_mutation(self):
        prepare(self.root,'wrong-host');before=(self.root/'store/state/reports.json').read_bytes()
        self.assertEqual(self.publish().returncode,2)
        self.assertEqual((self.root/'store/state/reports.json').read_bytes(),before)
    def test_exhaustion_and_corruption_preserve_reservations(self):
        for case in ['allocation-exhaustion','corrupt-allocation']:
            with self.subTest(case=case):
                if self.root.exists():
                    import shutil
                    shutil.rmtree(self.root)
                prepare(self.root,case);before=(self.root/'store/state/previews.json').read_bytes()
                result=self.tool('start-preview',str(self.root/'worktrees/review'),'docs','--','bun','run','dev')
                self.assertEqual(result.returncode,1)
                self.assertEqual((self.root/'store/state/previews.json').read_bytes(),before)


if __name__=='__main__':unittest.main()
