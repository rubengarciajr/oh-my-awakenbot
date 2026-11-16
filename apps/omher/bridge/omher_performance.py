"""Bounded, content-free observations of sends made through this bridge.

Gateway admission identity is required for event attribution. An unknown observation is
None, never a claim of zero latency. This module performs no I/O and retains no text.
"""
from collections import OrderedDict, deque
from dataclasses import dataclass, field
import math
import uuid


def _number(value):
    return float(value) if type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1e9 else None


def _identity(value):
    return value if isinstance(value, str) and 0 < len(value) <= 256 else None


@dataclass
class _Trace:
    target: tuple
    started: float
    trace_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    admission: str | None = None
    status: str = 'preparing'
    marks: dict = field(default_factory=dict)
    active_tools: set = field(default_factory=set)
    completed_tools: set = field(default_factory=set)
    tool_since: float | None = None
    tool_seconds: float = 0
    api_requests: set = field(default_factory=set)
    api_ms: float | None = None
    api_first_chunk_ms: float | None = None
    incomplete: bool = False

    def mark(self, name, at):
        self.marks.setdefault(name, max(0, round((at - self.started) * 1000)))

    def finish(self, status, at):
        if 'total_ms' in self.marks:
            return
        self.status = status
        self.mark('total_ms', at)
        if self.tool_since is not None:
            self.tool_seconds += max(0, at - self.tool_since)
            self.tool_since = None
        self.active_tools.clear()


class ReplyTimings:
    LIMIT = 30
    BUFFER_LIMIT = 128
    EVENTS = frozenset({'message.start', 'reasoning.delta', 'thinking.delta', 'message.delta',
                        'message.complete', 'tool.start', 'tool.complete', 'performance.api', 'error'})

    def __init__(self, clock):
        self.clock = clock
        self.traces = OrderedDict()
        self.early = deque(maxlen=self.BUFFER_LIMIT)
        self.overflow_targets = set()

    @property
    def buffered_count(self):
        return len(self.early)

    def begin(self, target, _request_id, *, started=None):
        if not any(t.target == target and t.status == 'preparing' for t in self.traces.values()):
            self.overflow_targets.discard(target)
        trace = _Trace(target=target, started=self.clock() if started is None else started)
        self.traces[trace.trace_id] = trace
        while len(self.traces) > self.LIMIT:
            self.traces.popitem(last=False)
        self.overflow_targets.intersection_update(t.target for t in self.traces.values())
        return trace

    def prepared(self, trace):
        trace.mark('bridge_prepare_ms', self.clock())

    def accepted(self, trace, receipt):
        trace.mark('submit_ack_ms', self.clock())
        trace.admission = _identity(receipt.get('admission_id')) if isinstance(receipt, dict) else None
        trace.status = 'queued' if isinstance(receipt, dict) and receipt.get('status') == 'queued' else 'submitted'
        if trace.admission is None:
            trace.status = 'unavailable'
            return
        trace.incomplete = trace.target in self.overflow_targets
        retained = deque(maxlen=self.BUFFER_LIMIT)
        for target, admission, kind, at, values in self.early:
            if target == trace.target and admission == trace.admission and at >= trace.started:
                self._event(trace, kind, at, values, early=True)
            else:
                retained.append((target, admission, kind, at, values))
        self.early = retained

    def failed(self, trace):
        trace.finish('error', self.clock())

    def disconnected(self, target):
        for trace in self.traces.values():
            if trace.target == target and trace.status not in {'done', 'error', 'interrupted', 'unavailable'}:
                trace.finish('disconnected', self.clock())
        self.early = deque((row for row in self.early if row[0] != target), maxlen=self.BUFFER_LIMIT)
        self.overflow_targets.discard(target)

    def observe(self, target, kind, params, payload):
        if kind not in self.EVENTS or not (admission := _identity(params.get('admission_id'))):
            return
        at = self.clock()
        # Discard all message text, reasoning, arguments and arbitrary gateway metadata now.
        values = {'has_text': isinstance(payload.get('text'), str) and bool(payload['text']),
                  'tool_id': _identity(payload.get('tool_id') or payload.get('tool_call_id')),
                  'request_id': _identity(payload.get('request_id')),
                  'duration_ms': _number(payload.get('duration_ms')),
                  'first_chunk_ms': _number(payload.get('first_chunk_ms')),
                  'status': payload.get('status') if payload.get('status') in {'done', 'error', 'interrupted'} else None}
        if kind in {'message.delta', 'reasoning.delta', 'thinking.delta'} and not values['has_text']:
            return
        for trace in reversed(self.traces.values()):
            if trace.target == target and trace.admission == admission:
                self._event(trace, kind, at, values)
                return
        if any(t.target == target and t.status == 'preparing' for t in self.traces.values()):
            # Only the first chunk matters. A fast stream must not evict its own first observation.
            if kind in {'message.start', 'message.delta', 'reasoning.delta', 'thinking.delta'} and any(
                    row[:3] == (target, admission, kind) for row in self.early):
                return
            if len(self.early) < self.BUFFER_LIMIT:
                self.early.append((target, admission, kind, at, values))
            else:
                self.overflow_targets.add(target)

    def _event(self, trace, kind, at, p, *, early=False):
        if 'total_ms' in trace.marks:
            return
        if kind == 'message.start':
            trace.mark('turn_start_ms', at)
            trace.status = 'running'
        elif kind in {'reasoning.delta', 'thinking.delta', 'message.delta'} and p['has_text']:
            if not trace.incomplete or early:
                trace.mark('first_progress_ms', at)
                if kind == 'message.delta':
                    trace.mark('first_text_ms', at)
        elif kind == 'tool.start' and (tool := p['tool_id']):
            if tool not in trace.completed_tools and tool not in trace.active_tools:
                if len(trace.completed_tools) + len(trace.active_tools) >= 512:
                    trace.incomplete = True
                    return
                if not trace.active_tools:
                    trace.tool_since = at
                trace.active_tools.add(tool)
        elif kind == 'tool.complete' and p['tool_id'] in trace.active_tools:
            tool = p['tool_id']
            trace.active_tools.remove(tool)
            trace.completed_tools.add(tool)
            if not trace.active_tools:
                trace.tool_seconds += max(0, at - trace.tool_since)
                trace.tool_since = None
        elif kind == 'performance.api':
            request, duration, first = p['request_id'], p['duration_ms'], p['first_chunk_ms']
            if request and request not in trace.api_requests and duration is not None:
                if len(trace.api_requests) >= 256:
                    trace.incomplete = True
                    return
                trace.api_requests.add(request)
                trace.api_ms = (trace.api_ms or 0) + duration
                if len(trace.api_requests) == 1 and first is not None and first <= duration:
                    trace.api_first_chunk_ms = first
        elif kind == 'message.complete':
            if p['has_text'] and not trace.incomplete:
                trace.mark('first_text_ms', at)
            trace.finish(p['status'] or 'done', at)
        elif kind == 'error':
            trace.finish('error', at)

    def snapshot(self):
        recent = []
        for trace in reversed(self.traces.values()):
            tools = trace.tool_seconds
            if trace.tool_since is not None:
                tools += max(0, self.clock() - trace.tool_since)
            row = {key: trace.marks.get(key) for key in ('bridge_prepare_ms', 'submit_ack_ms', 'turn_start_ms',
                   'first_progress_ms', 'first_text_ms', 'total_ms')}
            recent.append({**row, 'trace_id': trace.trace_id, 'status': trace.status,
                           'tools_ms': round(tools * 1000) if trace.admission and not trace.incomplete else None,
                           'provider_ms': trace.api_ms if not trace.incomplete else None, 'provider_first_chunk_ms': trace.api_first_chunk_ms,
                           'provider_calls': len(trace.api_requests) if not trace.incomplete else None})
        return {'version': 1, 'storage': 'memory', 'limit': self.LIMIT, 'recent': recent}
