"""Recent-first transcript reads use Hermes' client protocol and never alter a chat."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_bridge import Env, FakeClient, MAIN_RUNTIME, MAIN_STORED  # noqa: E402
import omher_bridge as ob  # noqa: E402


class TranscriptClient(FakeClient):
    async def rpc(self, method, *, _timeout=None, **params):
        if method == "runtime.describe":
            self.calls.append((method, params))
            return {"capabilities": ["session-transcript-v1"]}
        if method == "session.transcript":
            self.calls.append((method, params))
            older = "cursor" in params
            return {"session_id": params["session_id"], "rows": [
                {"row_kind": "message", "role": "user", "text": "earlier" if older else "recent", "row_id": 1 if older else 10},
                {"row_kind": "message", "role": "tool", "name": "terminal", "tool_call_id": "call"},
                {"row_kind": "compaction", "role": "system", "text": "existing summary", "row_id": 5},
                {"row_kind": "message", "role": "assistant", "text": "reply", "row_id": 2 if older else 11}],
                    "next_cursor": None if older else "opaque-cursor", "reset": not older}
        result = await super().rpc(method, _timeout=_timeout, **params)
        if method == "session.resume" and params.get("omit_messages"):
            result["messages"] = []
        return result


class ChatHistory(unittest.IsolatedAsyncioTestCase):
    async def test_open_reports_observed_turn_changes_while_transcript_page_waits(self):
        for before, after in ((False, True), (True, False)):
            with self.subTest(before=before, after=after):
                async with Env() as env:
                    conn = await env.bridge._conn("kami")
                    conn.client = client = TranscriptClient("kami")
                    original = client.rpc

                    async def rpc(method, **params):
                        result = await original(method, **params)
                        if method == "session.resume":
                            result["running"] = before
                        elif method == "session.transcript":
                            self.assertEqual(conn.main_id, MAIN_RUNTIME)
                            self.assertEqual(conn.in_turn, before)
                            conn.in_turn = after  # the pump's observed start or completion
                        return result

                    client.rpc = rpc
                    opened = (await env.bridge.op_chat_open({"bot": "kami"})).result
                    self.assertIs(opened["running"], after)

    async def test_recent_open_then_older_page_uses_native_cursor_and_owned_session(self):
        async with Env() as env:
            conn = await env.bridge._conn("kami")
            conn.client = c = TranscriptClient("kami")
            opened = (await env.bridge.op_chat_open({"bot": "kami"})).result
            self.assertEqual([m["text"] for m in opened["messages"]], ["recent", "reply"])
            self.assertEqual(opened["history"], {"mode": "paged", "cursor": "opaque-cursor"})
            self.assertEqual(c.find("session.resume"), [{"session_id": MAIN_STORED, "omit_messages": True}])
            self.assertEqual(c.find("session.transcript"), [{"session_id": MAIN_RUNTIME, "order": "latest", "limit": 60, "inline_images": False}])
            older = await env.bridge.op_chat_history({"bot": "kami", "cursor": "opaque-cursor", "session_id": "foreign"})
            self.assertEqual([m["id"] for m in older["messages"]], ["1", "2"])
            self.assertIsNone(older["next_cursor"])
            self.assertFalse(older["reset"])
            self.assertEqual(c.find("session.transcript")[-1]["session_id"], MAIN_RUNTIME)
            self.assertEqual(c.find("session.transcript")[-1]["cursor"], "opaque-cursor")
            self.assertEqual(c.find("runtime.describe"), [{}])
            self.assertFalse(any(method in {"prompt.submit", "session.mutate", "session.reset"} for method, _ in c.calls))

    async def test_older_gateway_keeps_resume_compatibility_and_does_not_fake_paging(self):
        async with Env() as env:
            opened = (await env.bridge.op_chat_open({"bot": "kami"})).result
            self.assertEqual(opened["history"], {"mode": "legacy", "cursor": None})
            c = env.clients["kami"]
            self.assertEqual(c.find("session.resume"), [{"session_id": MAIN_STORED}])
            self.assertEqual(c.find("session.transcript"), [])
            with self.assertRaises(ob.BridgeError) as caught:
                await env.bridge.op_chat_history({"bot": "kami", "cursor": "invented"})
            self.assertEqual(caught.exception.code, "bad_request")

    async def test_legacy_pages_preserve_every_fetched_message_beyond_previous_cap(self):
        async with Env() as env:
            conn = await env.bridge._conn("kami")
            original = conn.client.rpc

            async def rpc(method, **params):
                reply = await original(method, **params)
                if method == "session.resume":
                    reply["messages"] = [{"role": "assistant", "text": f"row {i}", "row_id": i} for i in range(250)]
                return reply

            conn.client.rpc = rpc
            opened = (await env.bridge.op_chat_open({"bot": "kami"})).result
            messages, cursor = opened["messages"], opened["history"]["cursor"]
            self.assertEqual(len(messages), 60)
            while cursor:
                page = await env.bridge.op_chat_history({"bot": "kami", "cursor": cursor})
                messages = page["messages"] + messages
                cursor = page["next_cursor"]
            self.assertEqual([m["id"] for m in messages], [str(i) for i in range(250)])
            self.assertEqual(len(conn.client.find("session.resume")), 1)

    async def test_history_requires_open_chat_and_valid_cursor_without_implicit_create(self):
        async with Env() as env:
            for cursor in (None, "", 1, "x" * 1025):
                with self.assertRaises(ob.BridgeError):
                    await env.bridge.op_chat_history({"bot": "kami", "cursor": cursor})
            conn = await env.bridge._conn("kami")
            conn.client = c = TranscriptClient("kami", bot_chat=False)
            with self.assertRaises(ob.BridgeError):
                await env.bridge.op_chat_history({"bot": "kami", "cursor": "opaque-cursor"})
            self.assertEqual(c.find("session.create"), [])
            self.assertEqual(c.find("session.resume"), [])

    def test_paged_normalization_never_drops_rows_beyond_old_open_limit(self):
        rows = [{"role": "assistant", "text": f"reply {i}", "row_id": i} for i in range(250)]
        self.assertEqual(len(ob.chat_messages(rows, limit=None)), 250)

    def test_oversized_row_keeps_gateway_truncation_marker(self):
        [message] = ob.chat_messages([{"role": "assistant", "text": "visible head", "row_id": 9, "truncated": True}])
        self.assertTrue(message["truncated"])


if __name__ == "__main__":
    unittest.main()
