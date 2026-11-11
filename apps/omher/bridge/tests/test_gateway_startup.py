"""Startup probes stay bounded and preserve each bot's context without a global environment lock."""
import asyncio
from contextlib import AsyncExitStack, asynccontextmanager
from contextvars import ContextVar
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import omher_bridge as ob


class GatewayStartup(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.scope = ContextVar('test_hermes_home', default='previous')
        self.discover = Mock(return_value=types.SimpleNamespace(state='ready', endpoint=object(), reason_code=None))
        self.ensure = Mock()
        self.dials = []
        self.gate = None
        scope = self.scope

        @asynccontextmanager
        async def connect_gateway(*, endpoint=None):
            self.dials.append((scope.get(), endpoint))
            if self.gate is not None:
                await self.gate.wait()
            yield object()

        runtime = types.ModuleType('hermes_cli.gateway_runtime')
        runtime.discover_gateway_endpoint = self.discover
        runtime.ensure_gateway_runtime = self.ensure
        runtime.attachable = lambda r: r.state == 'ready' and r.endpoint is not None
        client = types.ModuleType('hermes_cli.gateway_client')
        client.connect_gateway = connect_gateway
        constants = types.ModuleType('hermes_constants')
        constants.set_hermes_home_override = scope.set
        constants.reset_hermes_home_override = scope.reset
        self.modules = patch.dict(sys.modules, {'hermes_cli': types.ModuleType('hermes_cli'),
            'hermes_cli.gateway_runtime': runtime, 'hermes_cli.gateway_client': client,
            'hermes_constants': constants})
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.bridge = ob.Bridge(token='test')

    async def test_starting_returns_pending_without_starting_or_dialing_again(self):
        self.discover.return_value = types.SimpleNamespace(state='starting', endpoint=None, reason_code=None)
        async with AsyncExitStack() as stack:
            with self.assertRaises(ob.BridgeError) as error:
                await self.bridge._default_connect(stack, Path('/bots/one'))
        self.assertEqual(error.exception.code, 'gateway_starting')
        self.ensure.assert_not_called()
        self.assertFalse(self.dials)
        self.assertEqual(self.scope.get(), 'previous')

    async def test_absent_owner_gets_one_bounded_start_then_remains_pending(self):
        self.discover.return_value = types.SimpleNamespace(state='absent', endpoint=None, reason_code=None)
        self.ensure.return_value = types.SimpleNamespace(state='starting', endpoint=None, reason_code='deadline')
        async with AsyncExitStack() as stack:
            with self.assertRaises(ob.BridgeError) as error:
                await self.bridge._default_connect(stack, Path('/bots/one'))
        self.assertEqual(error.exception.code, 'gateway_starting')
        self.ensure.assert_called_once_with(Path('/bots/one'), timeout=5.0, idle_exit=True)

    async def test_ready_owner_uses_explicit_endpoint_and_keeps_environment_unchanged(self):
        before = os.environ.get('HERMES_HOME')
        async with AsyncExitStack() as stack:
            await self.bridge._default_connect(stack, Path('/bots/one'))
        self.assertEqual(self.dials, [(Path('/bots/one'), self.discover.return_value.endpoint)])
        self.ensure.assert_not_called()
        self.assertEqual(os.environ.get('HERMES_HOME'), before)
        self.assertEqual(self.scope.get(), 'previous')

    async def test_one_waiting_dial_does_not_serialize_another_profile(self):
        self.gate = asyncio.Event()
        async with AsyncExitStack() as one, AsyncExitStack() as two:
            first = asyncio.create_task(self.bridge._default_connect(one, Path('/bots/one')))
            second = asyncio.create_task(self.bridge._default_connect(two, Path('/bots/two')))
            try:
                for _ in range(100):
                    if len(self.dials) == 2:
                        break
                    await asyncio.sleep(.001)
                self.assertCountEqual([x[0] for x in self.dials], [Path('/bots/one'), Path('/bots/two')])
            finally:
                self.gate.set()
                await asyncio.gather(first, second)
        self.assertEqual(self.scope.get(), 'previous')

    async def test_refused_owner_is_not_started_or_dialed(self):
        self.discover.return_value = types.SimpleNamespace(state='incompatible', endpoint=None, reason_code='runtime_protocol')
        async with AsyncExitStack() as stack:
            with self.assertRaises(ob.BridgeError) as error:
                await self.bridge._default_connect(stack, Path('/bots/one'))
        self.assertEqual(error.exception.code, 'gateway_unavailable')
        self.ensure.assert_not_called()
        self.assertFalse(self.dials)

    async def test_permission_and_startup_failure_are_actionable_not_transient(self):
        for reason in ['authorization', 'invalid_control_peer', 'profile_parked', 'runtime_exited']:
            self.discover.return_value = types.SimpleNamespace(state='inaccessible', endpoint=None,
                                                                reason_code=reason, detail='Action required.')
            async with AsyncExitStack() as stack:
                with self.assertRaises(ob.BridgeError) as error:
                    await self.bridge._default_connect(stack, Path('/bots/one'))
            self.assertEqual(error.exception.code, 'gateway_unavailable')
            self.assertIn(reason, error.exception.message)
            self.assertIn('Action required.', error.exception.message)
        self.ensure.assert_not_called()
        self.assertFalse(self.dials)

    async def test_control_timeout_remains_a_transient_failure(self):
        self.discover.return_value = types.SimpleNamespace(state='inaccessible', endpoint=None,
                                                            reason_code='control_timeout')
        async with AsyncExitStack() as stack:
            with self.assertRaises(ob.BridgeError) as error:
                await self.bridge._default_connect(stack, Path('/bots/one'))
        self.assertEqual(error.exception.code, 'bot_offline')

    async def test_connection_cooldown_preserves_nonretryable_refusal_code(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            (home / 'config.yaml').write_text('model:\n  default: model\n')
            async def factory(stack, home):
                raise ob.BridgeError('gateway_unavailable', 'Incompatible gateway protocol.')
            bridge = ob.Bridge(token='test', hermes_home=home, gateway_factory=factory)
            for _ in range(2):
                with self.assertRaises(ob.BridgeError) as error:
                    await bridge._conn('default')
                self.assertEqual(error.exception.code, 'gateway_unavailable')
                self.assertIn('Incompatible', error.exception.message)

    async def test_pending_connection_status_does_not_enter_offline_cooldown(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            (home / 'config.yaml').write_text('model:\n  default: model\n')
            attempts = 0
            async def factory(stack, home):
                nonlocal attempts
                attempts += 1
                raise ob.BridgeError('gateway_starting', 'Hermes is starting.')
            bridge = ob.Bridge(token='test', hermes_home=home, gateway_factory=factory)
            bridge.emit = unittest.mock.AsyncMock()
            for _ in range(2):
                with self.assertRaises(ob.BridgeError) as error:
                    await bridge._conn('default')
                self.assertEqual(error.exception.code, 'gateway_starting')
            self.assertEqual(attempts, 2)
            self.assertTrue(bridge.conns['default'].connecting)
            bridge.emit.assert_awaited_with('bot.status', 'default', status='starting', running=False)


if __name__ == '__main__':
    unittest.main()
