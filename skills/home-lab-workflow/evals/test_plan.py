import json
from pathlib import Path
import shutil
import tempfile
import unittest
from plan import prepare


class PlanTests(unittest.TestCase):
    def test_prepares_fresh_matched_jobs_with_a_frozen_skill_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);skill=root/'skill'
            (skill/'references').mkdir(parents=True);(skill/'evals').mkdir()
            (skill/'SKILL.md').write_text('Original instructions')
            (skill/'references/reports.md').write_text('Original reference')
            (skill/'evals/cases.json').write_text(json.dumps({'conditions':['skill','control'],'cases':[{'id':'case','task':'Do the task'}]}))
            shutil.copy2(Path(__file__).with_name('fixture.py'),skill/'evals/fixture.py')
            plan=prepare(root/'run',skill,'parent-id')
            (skill/'SKILL.md').write_text('Changed after planning')
            self.assertEqual((root/'run/skill-snapshot/SKILL.md').read_text(),'Original instructions')
            self.assertEqual(len(plan['jobs']),2)
            self.assertTrue(all(j['fork_turns']=='none' for j in plan['jobs']))
            self.assertIn(str(root/'run/skill-snapshot'),plan['jobs'][0]['prompt'])
            self.assertTrue((root/'run/case-control/context.json').is_file())


if __name__=='__main__':unittest.main()
