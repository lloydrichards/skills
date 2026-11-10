import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('trace_export',Path(__file__).with_name('trace.py'))
trace=importlib.util.module_from_spec(spec);spec.loader.exec_module(trace)


class TraceTests(unittest.TestCase):
    def test_counts_response_usage_once_without_summing_cumulative_totals(self):
        records=[{'type':'token_usage_record','payload':{'response_id':'a','usage':{'input_tokens':100,'cached_input_tokens':80,'output_tokens':10},'thread_token_usage':{'input_tokens':100}}}, {'type':'token_usage_record','payload':{'response_id':'a','usage':{'input_tokens':100,'cached_input_tokens':80,'output_tokens':10}}}, {'type':'token_usage_record','payload':{'response_id':'b','usage':{'input_tokens':150,'cached_input_tokens':100,'output_tokens':20},'thread_token_usage':{'input_tokens':250}}}]
        result=trace.normalize(records)
        self.assertEqual(result['usage']['input_tokens'],250)
        self.assertEqual(result['metrics']['uncached_input_tokens'],70)
        self.assertEqual(result['responses'],2)
        self.assertEqual(len(result['response_usage']),2)
        self.assertEqual(result['response_usage'][0]['cached_input_tokens'],80)

    def test_exports_visible_calls_and_messages_without_reasoning_or_system_text(self):
        def row(payload):return {'type':'response_item','payload':payload}
        records=[row({'type':'message','role':'system','content':[{'type':'input_text','text':'private instructions'}]}),row({'type':'reasoning','text':'private reasoning'}),row({'type':'function_call','name':'exec','call_id':'a','arguments':'{"cmd":"hostname"}'}),row({'type':'function_call_output','call_id':'a','output':'home-lab'}),row({'type':'message','role':'assistant','phase':'final_answer','content':[{'type':'output_text','text':'Ready'}]})]
        result=trace.normalize(records)
        self.assertEqual([e['kind'] for e in result['events']],['tool_call','tool_result','assistant'])
        self.assertEqual(result['metrics']['tool_calls'],1)
        self.assertNotIn('private',str(result))

    def test_missing_token_measurements_are_unknown_not_zero(self):
        result=trace.normalize([])
        self.assertIsNone(result['usage'])
        self.assertEqual(result['usage_source'],'unavailable')

    def test_cumulative_fallback_uses_last_record_only(self):
        result=trace.normalize([{'type':'token_usage_record','payload':{'thread_token_usage':{'input_tokens':10}}},{'type':'token_usage_record','payload':{'thread_token_usage':{'input_tokens':20}}}])
        self.assertEqual(result['usage']['input_tokens'],20)


if __name__=='__main__':unittest.main()
