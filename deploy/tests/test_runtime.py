"""State persistence and rollback behavior at the external Docker boundary."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import agent


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.runtime = Path(self.tmp.name) / "runtime"
        self.runtime.mkdir()
        (self.runtime / "state").mkdir()
        self.config = {"repo": "EddieLiu58/seaxopenai2026-10", "branch": "master",
                       "workflow": "backend-ci.yml", "required_job": "backend",
                       "enabled": False, "auto_rollback": True}
        (self.runtime / "config.json").write_text(json.dumps(self.config))
        self.engine = agent.Engine(self.runtime, self.config)

    def test_successful_replacement_keeps_previous_version(self):
        agent.state_write(self.runtime, "current-image", "old-image")
        with patch.object(self.engine, "compose"):
            self.engine.replace_backend("new-image")
        self.assertEqual(agent.state_read(self.runtime, "current-image"), "new-image")
        self.assertEqual(agent.state_read(self.runtime, "previous-image"), "old-image")

    def test_failed_candidate_preserves_state_after_rollback(self):
        agent.state_write(self.runtime, "current-image", "old-image")
        with patch.object(self.engine, "compose", side_effect=[RuntimeError("not ready"), None]):
            with self.assertRaisesRegex(RuntimeError, "previous image restored"):
                self.engine.replace_backend("new-image")
        self.assertEqual(agent.state_read(self.runtime, "current-image"), "old-image")
        self.assertEqual(agent.state_read(self.runtime, "previous-image"), "")

    def test_default_rollbacks_do_not_assume_schema_compatibility(self):
        self.config["auto_rollback"] = False
        agent.state_write(self.runtime, "current-image", "old-image")
        with patch.object(self.engine, "compose", side_effect=RuntimeError("not ready")):
            with self.assertRaisesRegex(RuntimeError, "manual recovery"):
                self.engine.replace_backend("new-image")
        self.assertEqual(agent.state_read(self.runtime, "current-image"), "old-image")

    def test_failed_backup_is_not_left_as_a_valid_dump(self):
        with patch.object(self.engine, "compose", side_effect=RuntimeError("pg_dump failed")):
            with self.assertRaises(RuntimeError):
                self.engine.backup()
        self.assertEqual(list((self.runtime / "backups").glob("*.dump")), [])

    def test_empty_backup_cannot_be_accepted(self):
        with patch.object(self.engine, "compose"):
            with self.assertRaisesRegex(RuntimeError, "empty"):
                self.engine.backup()
        self.assertEqual(list((self.runtime / "backups").glob("*.dump")), [])

    def test_real_process_lock_prevents_overlapping_config_or_deployment(self):
        with agent.deployment_lock(self.runtime):
            result = subprocess.run([sys.executable, str(SCRIPTS / "agent.py"), "--runtime",
                                     str(self.runtime), "enable"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("busy", result.stderr)
        self.assertFalse(json.loads((self.runtime / "config.json").read_text())["enabled"])
        # The OS releases the lock; no stale lock directory needs deletion.
        with agent.deployment_lock(self.runtime):
            pass

    def test_new_runtime_is_disabled_and_secrets_are_private(self):
        new_runtime = Path(self.tmp.name) / "fresh"
        agent.init_runtime(new_runtime, self.config["repo"], "master")
        self.assertFalse(agent.load_config(new_runtime)["enabled"])
        self.assertEqual((new_runtime / ".env").stat().st_mode & 0o777, 0o600)
        self.assertNotIn("replace-with", (new_runtime / ".env").read_text())
        self.assertTrue((new_runtime / "tools" / "backend.Dockerfile").exists())

    def test_plist_has_absolute_paths_and_a_60_second_interval(self):
        import plistlib
        result = agent.write_agent_plist(self.runtime)
        with Path(result["path"]).open("rb") as source:
            plist = plistlib.load(source)
        self.assertEqual(plist["StartInterval"], 60)
        self.assertTrue(all(str(value).startswith("/") for value in plist["ProgramArguments"][:2]))
        self.assertNotIn("$HOME", json.dumps(plist))


if __name__ == "__main__":
    unittest.main()
