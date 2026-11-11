"""Local timings never infer correlation from a bot name or retain message content."""
import json
import sys
import unittest
from unittest.mock import AsyncMock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from omher_performance import ReplyTimings
import omher_bridge as ob


class Clock:
    value = 0.0

    def __call__(self):
        return self.value


class ReplyTimingTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.timings = ReplyTimings(self.clock)
        self.target = ('private-profile', 'private-session')

    def event(self, kind, at, admission='a1', **payload):
        self.clock.value = at
        self.timings.observe(self.target, kind, {'admission_id': admission}, payload)

    def test_pre_ack_events_are_correlated_and_content_is_not_retained(self):
        trace = self.timings.begin(self.target, 'request1')
        self.clock.value = .01
        self.timings.prepared(trace)
        self.event('message.start', .05)
        self.event('reasoning.delta', .4, text='secret reasoning')
        self.event('message.delta', .8, text='private response')
        self.clock.value = 1
        self.timings.accepted(trace, {'admission_id': 'a1', 'status': 'started'})
        self.event('message.complete', 2, text='private response', status='done')
        row = self.timings.snapshot()['recent'][0]
        self.assertEqual(row['bridge_prepare_ms'], 10)
        self.assertEqual(row['submit_ack_ms'], 1000)
        self.assertEqual(row['turn_start_ms'], 50)
        self.assertEqual(row['first_progress_ms'], 400)
        self.assertEqual(row['first_text_ms'], 800)
        self.assertEqual(row['total_ms'], 2000)
        self.assertEqual(row['status'], 'done')
        encoded = json.dumps(self.timings.snapshot())
        for secret in ['private', 'secret', 'request1', '"a1"']:
            self.assertNotIn(secret, encoded)

    def test_queued_and_unrelated_turns_are_not_misattributed(self):
        first = self.timings.begin(self.target, 'r1')
        second = self.timings.begin(self.target, 'r2')
        self.timings.accepted(first, {'admission_id': 'a1', 'status': 'queued'})
        self.timings.accepted(second, {'admission_id': 'a2', 'status': 'queued'})
        self.event('message.delta', .1, admission='external', text='unrelated')
        self.event('message.delta', .2, admission='a2', text='second')
        rows = self.timings.snapshot()['recent']
        self.assertEqual(rows[0]['first_text_ms'], 200)
        self.assertIsNone(rows[1]['first_text_ms'])

    def test_overlapping_tools_count_wall_time_once_and_ignore_duplicates(self):
        trace = self.timings.begin(self.target, 'r1')
        self.timings.accepted(trace, {'admission_id': 'a1'})
        self.event('tool.start', 1, tool_id='t1', args={'secret': 'password'})
        self.event('tool.start', 2, tool_id='t2')
        self.event('tool.complete', 3, tool_id='t1')
        self.event('tool.start', 3.2, tool_id='t1')
        self.event('tool.complete', 4, tool_id='t2')
        self.event('message.complete', 5, status='done')
        self.assertEqual(self.timings.snapshot()['recent'][0]['tools_ms'], 3000)

    def test_missing_correlation_is_unknown_not_zero(self):
        trace = self.timings.begin(self.target, 'r1')
        self.clock.value = .1
        self.timings.accepted(trace, {})
        self.event('message.delta', .2, text='cannot attribute')
        row = self.timings.snapshot()['recent'][0]
        self.assertEqual(row['status'], 'unavailable')
        self.assertIsNone(row['first_text_ms'])
        self.assertIsNone(row['provider_ms'])

    def test_fast_stream_before_ack_preserves_its_first_text_observation(self):
        trace = self.timings.begin(self.target, 'r1')
        for i in range(1000):
            self.event('message.delta', 1 + i / 1000, text='chunk')
        self.timings.accepted(trace, {'admission_id': 'a1'})
        self.assertEqual(self.timings.snapshot()['recent'][0]['first_text_ms'], 1000)

    def test_overflow_keeps_known_first_text_but_reports_partial_tool_measurement_unknown(self):
        trace = self.timings.begin(self.target, 'r1')
        self.event('message.delta', .1, text='first')
        for i in range(200):
            self.event('tool.start', i + 1, tool_id=f't{i}')
            self.event('tool.complete', i + 1.5, tool_id=f't{i}')
        self.timings.accepted(trace, {'admission_id': 'a1'})
        row = self.timings.snapshot()['recent'][0]
        self.assertEqual(row['first_text_ms'], 100)
        self.assertIsNone(row['tools_ms'])

    def test_provider_metrics_are_optional_and_reject_nonfinite_or_negative_values(self):
        trace = self.timings.begin(self.target, 'r1')
        self.timings.accepted(trace, {'admission_id': 'a1'})
        self.event('performance.api', 1, request_id='p1', duration_ms=500, first_chunk_ms=120)
        self.event('performance.api', 1.1, request_id='p1', duration_ms=500, first_chunk_ms=120)
        self.event('performance.api', 2, request_id='p2', duration_ms=float('nan'), first_chunk_ms=-1)
        row = self.timings.snapshot()['recent'][0]
        self.assertEqual(row['provider_ms'], 500)
        self.assertEqual(row['provider_first_chunk_ms'], 120)
        self.assertEqual(row['provider_calls'], 1)

    def test_lost_early_observation_is_not_replaced_by_late_complete_as_first_token(self):
        trace = self.timings.begin(self.target, 'r1')
        for i in range(150):
            self.event('tool.start', i, admission='unrelated', tool_id=f't{i}')
        self.event('message.delta', 151, text='lost early chunk')
        self.timings.accepted(trace, {'admission_id': 'a1'})
        self.event('message.complete', 152, text='later completion', status='done')
        row = self.timings.snapshot()['recent'][0]
        self.assertIsNone(row['first_text_ms'])
        self.assertEqual(row['total_ms'], 152000)

    def test_provider_request_cap_is_exact_then_reports_unknown_after_overflow(self):
        trace = self.timings.begin(self.target, 'r1')
        self.timings.accepted(trace, {'admission_id': 'a1'})
        for i in range(256):
            self.event('performance.api', 1, request_id=f'p{i}', duration_ms=1, first_chunk_ms=0)
        self.assertEqual(self.timings.snapshot()['recent'][0]['provider_ms'], 256)
        self.event('performance.api', 2, request_id='p256', duration_ms=1, first_chunk_ms=0)
        row = self.timings.snapshot()['recent'][0]
        self.assertIsNone(row['provider_ms'])
        self.assertIsNone(row['provider_calls'])

    def test_failure_disconnect_and_bounded_memory(self):
        trace = self.timings.begin(self.target, 'r1')
        self.timings.failed(trace)
        self.assertEqual(self.timings.snapshot()['recent'][0]['status'], 'error')
        trace = self.timings.begin(self.target, 'r2')
        self.timings.accepted(trace, {'admission_id': 'a2'})
        self.timings.disconnected(self.target)
        self.assertEqual(self.timings.snapshot()['recent'][0]['status'], 'disconnected')
        for i in range(200):
            self.timings.begin(self.target, f'r{i}')
            self.event('message.delta', i, admission=f'unrelated{i}', text='never retained')
        self.assertLessEqual(len(self.timings.snapshot()['recent']), 30)
        self.assertLessEqual(self.timings.buffered_count, 128)


class BridgeTimingTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_and_real_event_path_bind_admission_before_late_ack(self):
        clock = Clock()
        bridge = ob.Bridge(token='test', clock=clock)
        conn = ob.Conn({'name': 'private-profile'})
        conn.main_id = 'runtime'
        bridge._conn = AsyncMock(return_value=conn)
        bridge._target = AsyncMock(return_value=('runtime', None))
        bridge._probe_clarify_batch = AsyncMock()
        bridge.emit = AsyncMock()

        async def submit(_conn, _sid, _text, _input):
            clock.value = .3
            await bridge._on_frame(conn, {'method': 'event', 'params': {
                'session_id': 'runtime', 'admission_id': 'a1', 'type': 'message.delta',
                'payload': {'text': 'private response'}}})
            clock.value = .4
            return {'admission_id': 'a1', 'status': 'started'}

        bridge._submit = AsyncMock(side_effect=submit)
        response = await bridge.op_chat_send({'bot': conn.name, 'text': 'private prompt'})
        report = await bridge.op_performance_read({})
        self.assertEqual(response['trace_id'], report['recent'][0]['trace_id'])
        self.assertEqual(report['recent'][0]['first_text_ms'], 300)
        self.assertEqual(report['recent'][0]['submit_ack_ms'], 400)
        self.assertNotIn('private', json.dumps(report))
        self.assertEqual(bridge._submit.await_count, 1)
        await bridge._drop(conn, emit=False)
        self.assertEqual((await bridge.op_performance_read({}))['recent'][0]['status'], 'disconnected')


if __name__ == '__main__':
    unittest.main()
