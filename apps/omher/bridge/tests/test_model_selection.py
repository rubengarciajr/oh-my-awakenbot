"""Model selection keeps Hermes' confirmation and revision fences intact."""
import sys
from pathlib import Path
import unittest
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_bridge import Env, GatewayRPCError


class ModelSelection(unittest.IsolatedAsyncioTestCase):
    async def test_guard_token_is_returned_then_forwarded_only_on_explicit_confirm(self):
        async with Env() as env:
            conn = await env.bridge._conn("kami")
            original = conn.client.rpc
            calls = []
            async def guarded(method, **params):
                if method == "session.mutate":
                    calls.append(params)
                    if params["operation"] == "model" and params["payload"].get("confirm") != "bound-token":
                        return {"status": "confirmation_required", "confirm": "bound-token", "confirm_message": "Review model cost."}
                return await original(method, **params)
            conn.client.rpc = guarded
            params = {"bot": "kami", "model": "next-model", "provider": "next-provider", "reasoning": "low"}
            result = await env.bridge.op_set_model(params)
            self.assertEqual(result["confirmation"], {"token": "bound-token", "message": "Review model cost."})
            self.assertEqual(result["model"], "claude-opus-5-5")
            self.assertEqual(len(calls), 1)  # no reasoning change before confirmation
            await env.bridge.op_set_model({**params, "confirm": "bound-token"})
            self.assertEqual(calls[1]["payload"]["confirm"], "bound-token")
            self.assertEqual(calls[2]["operation"], "reasoning")

    async def test_stale_revision_refusal_is_retried_once_with_fresh_snapshot(self):
        async with Env() as env:
            conn = await env.bridge._conn("kami")
            original = conn.client.rpc
            revisions = []
            async def stale_once(method, **params):
                if method == "session.mutate":
                    revisions.append(params["expected_revision"])
                    if len(revisions) == 1:
                        conn.client.revision = 8
                        raise GatewayRPCError("revision_conflict")
                return await original(method, **params)
            conn.client.rpc = stale_once
            await env.bridge.op_set_model({"bot": "kami", "reasoning": "low"})
            self.assertEqual(revisions, [7, 8])

    async def test_lost_reply_is_never_retried(self):
        async with Env() as env:
            conn = await env.bridge._conn("kami")
            original = conn.client.rpc
            calls = 0
            async def lost_reply(method, **params):
                nonlocal calls
                if method == "session.mutate":
                    calls += 1
                    raise TimeoutError("no reply")
                return await original(method, **params)
            conn.client.rpc = lost_reply
            with self.assertRaises(TimeoutError):
                await env.bridge.op_set_model({"bot": "kami", "reasoning": "low"})
            self.assertEqual(calls, 1)

    async def test_session_info_refreshes_only_owned_chat_model(self):
        async with Env() as env:
            conn = await env.bridge._conn("kami")
            await env.bridge._main(conn)
            env.bridge.emit = AsyncMock()
            params = {"type": "session.info", "session_id": conn.main_id,
                      "payload": {"model": "next-model", "provider": "next-provider", "reasoning_effort": "high"}}
            await env.bridge._on_frame(conn, {"method": "event", "params": params})
            env.bridge.emit.assert_awaited_once_with("model.changed", "kami", model="next-model", provider="next-provider", reasoning="high")
            env.bridge.emit.reset_mock()
            await env.bridge._on_frame(conn, {"method": "event", "params": {**params, "session_id": "foreign"}})
            env.bridge.emit.assert_not_awaited()

    async def test_providerless_events_resolve_session_route_without_history(self):
        async with Env() as env:
            conn = await env.bridge._conn("kami")
            await env.bridge._main(conn)
            conn.client.model_info = {"model": "cross-provider-model", "provider": "new-provider", "reasoning_effort": "low"}
            env.bridge.emit = AsyncMock()
            await env.bridge._on_frame(conn, {"method": "event", "params": {
                "type": "session.info", "session_id": conn.main_id,
                "payload": {"model": "cross-provider-model", "reasoning_effort": "low"}}})
            env.bridge.emit.assert_awaited_once_with("model.changed", "kami", model="cross-provider-model", provider="new-provider", reasoning="low")
            self.assertEqual(conn.client.find("session.info")[-1], {"session_id": conn.main_id})

    async def test_model_fence_and_options_metadata_reads_omit_transcripts(self):
        async with Env() as env:
            conn = await env.bridge._conn("kami")
            await env.bridge._main(conn)
            conn.client.calls.clear()
            await env.bridge.op_set_model({"bot": "kami", "reasoning": "low"})
            await env.bridge.op_models_options({"bot": "kami"})
            resumes = conn.client.find("session.resume")
            self.assertTrue(resumes)
            self.assertTrue(all(p.get("omit_messages") is True for p in resumes))
