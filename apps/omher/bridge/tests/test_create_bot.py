"""Explicit creation uses Hermes' profile API; all filesystem fixtures are temporary."""
import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import omher_bridge as ob


class CreateBot(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        (self.home / "config.yaml").write_text("model:\n  default: inherited-model\n  provider: inherited-provider\n")
        self.bridge = ob.Bridge(token="test", hermes_home=self.home)
        self.conn = object()
        self.bridge._conn = AsyncMock(return_value=self.conn)
        self.bridge.emit = AsyncMock()
        self.bridge._call = AsyncMock(side_effect=self.create)

    async def create(self, conn, method, **p):
        self.assertIs(conn, self.conn)
        self.assertEqual(method, "profiles.create")
        target = self.home / "profiles" / p["name"]
        target.mkdir(parents=True)
        (target / "config.yaml").write_bytes((self.home / "config.yaml").read_bytes())
        return {"ok": True, "name": p["name"], "path": str(target), "soul_written": bool(p.get("soul"))}

    async def test_explicit_create_preserves_source_model_and_safe_clone_flags(self):
        result = await self.bridge.op_bots_create({"name": "sermon-helper", "display_name": "Sermon Helper",
                                                  "source": "default", "description": "Sunday research",
                                                  "soul": "Use concise, source-backed answers."})
        bot = result["bot"]
        self.assertEqual((bot["name"], bot["display_name"], bot["model"], bot["provider"]),
                         ("sermon-helper", "Sermon Helper", "inherited-model", "inherited-provider"))
        p = self.bridge._call.call_args.kwargs
        self.assertEqual(p["clone_from"], "default")
        for k in ("clone_all", "clone_channels", "mirror_credentials"):
            self.assertIs(p[k], False)
        self.assertIs(p["no_alias"], True)
        self.assertEqual(p["soul"], "Use concise, source-backed answers.")
        self.assertFalse((self.home / "profiles" / "sermon-helper" / "state.db").exists())

    async def test_invalid_and_reserved_ids_refused_before_gateway(self):
        for name in ("../escape", "Upper", "", "a/b", "default", "hermes", "root", "test", "tmp", "sudo", "a" * 65):
            with self.subTest(name=name), self.assertRaises(ob.BridgeError):
                await self.bridge.op_bots_create({"name": name, "display_name": "Name", "source": "default"})
        self.bridge._call.assert_not_called()

    async def test_existing_directory_or_dangling_link_never_overwritten(self):
        target = self.home / "profiles" / "taken"
        target.mkdir(parents=True)
        marker = target / "keep.txt"
        marker.write_text("keep")
        with self.assertRaises(ob.BridgeError) as caught:
            await self.bridge.op_bots_create({"name": "taken", "display_name": "Name", "source": "default"})
        self.assertEqual(caught.exception.code, "already_exists")
        self.assertEqual(marker.read_text(), "keep")
        link = target.parent / "link"
        try:
            link.symlink_to(target.parent / "missing", target_is_directory=True)
        except OSError:
            return  # Windows may disallow unprivileged symlinks.
        with self.assertRaises(ob.BridgeError):
            await self.bridge.op_bots_create({"name": "link", "display_name": "Name", "source": "default"})
        self.bridge._call.assert_not_called()

    async def test_unknown_source_and_invalid_fields_never_create(self):
        for extra in ({"source": "missing"}, {"display_name": ""}, {"description": []}, {"soul": "x" * 16001}):
            with self.subTest(extra=extra), self.assertRaises(ob.BridgeError):
                await self.bridge.op_bots_create({"name": "newbot", "display_name": "Name", "source": "default", **extra})
        self.bridge._call.assert_not_called()

    async def test_simultaneous_duplicate_requests_only_create_once(self):
        p = {"name": "unique", "display_name": "Unique", "source": "default"}
        outcomes = await asyncio.gather(self.bridge.op_bots_create(p), self.bridge.op_bots_create(p), return_exceptions=True)
        self.assertEqual(sum(isinstance(x, dict) for x in outcomes), 1)
        self.assertEqual(self.bridge._call.call_count, 1)

    async def test_missing_persona_confirmation_surfaces_warning_after_creation(self):
        async def create_without_soul(*a, **kw):
            return {**await self.create(*a, **kw), "soul_written": False}
        self.bridge._call.side_effect = create_without_soul
        result = await self.bridge.op_bots_create({"name": "helper", "display_name": "Helper", "source": "default", "soul": "Be helpful"})
        self.assertIn("warning", result)
        self.assertEqual(result["bot"]["name"], "helper")

    async def test_gateway_must_confirm_creation_in_this_installation(self):
        self.bridge._call.side_effect = None
        self.bridge._call.return_value = {"ok": True, "path": "/outside/the/installation", "name": "newbot"}
        with self.assertRaises(ob.BridgeError) as caught:
            await self.bridge.op_bots_create({"name": "newbot", "display_name": "New bot", "source": "default"})
        self.assertEqual(caught.exception.code, "create_unconfirmed")
        self.assertFalse((self.home / "profiles" / "newbot").exists())
        self.assertIs(self.bridge.ops["bots.create"].__self__, self.bridge)

    async def test_gateway_name_refusal_has_an_actionable_inline_error(self):
        class GatewayRPCError(Exception):
            code = 4062
        self.bridge._call.side_effect = GatewayRPCError("request_failed")
        with self.assertRaises(ob.BridgeError) as caught:
            await self.bridge.op_bots_create({"name": "newbot", "display_name": "New bot", "source": "default"})
        self.assertEqual(caught.exception.code, "bad_request")
        self.assertIn("Choose another ID", caught.exception.message)
