"""Exercise the deployment CLI with GitHub/Git process boundaries controlled."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "scripts" / "agent.py"
SHA = "a" * 40
REPO = "EddieLiu58/seaxopenai2026-10"


def run_fixture(**changes):
    result = {
        "id": 123,
        "run_number": 7,
        "run_attempt": 1,
        "head_sha": SHA,
        "head_branch": "master",
        "event": "push",
        "status": "completed",
        "conclusion": "success",
        "repository": {"full_name": REPO},
        "html_url": "https://github.com/" + REPO + "/actions/runs/123",
    }
    result.update(changes)
    return result


class AgentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.runtime = Path(self.tmp.name) / "runtime"
        self.runtime.mkdir()
        (self.runtime / "state").mkdir()
        self.config = {"repo": REPO, "branch": "master", "enabled": True,
                       "workflow": "backend-ci.yml", "required_job": "backend"}
        self.bin = Path(self.tmp.name) / "bin"
        self.bin.mkdir()
        fake = '''#!/usr/bin/env python3
import json, os, pathlib, sys
fixture = json.loads(pathlib.Path(os.environ["FIXTURE"]).read_text())
name = pathlib.Path(sys.argv[0]).name
if name == "git":
    print(fixture.get("head", "a"*40) + "\\trefs/heads/master")
elif name == "curl":
    sys.stdin.read()
    if fixture.get("api_error"):
        sys.exit(22)
    key = "jobs" if "/jobs?" in sys.argv[-1] else "runs"
    print(json.dumps({"jobs": fixture.get("jobs", []), "total_count": len(fixture.get("jobs", []))}
                     if key == "jobs" else {"workflow_runs": fixture.get("runs", [])}))
else:
    sys.exit(99)
'''
        for name in ("git", "curl", "docker"):
            script = self.bin / name
            script.write_text(fake)
            script.chmod(0o755)
        self.fixture = Path(self.tmp.name) / "fixture.json"
        self.fixture.write_text(json.dumps({"runs": [run_fixture()], "jobs": [
            {"name": "backend", "status": "completed", "conclusion": "success"}]}))
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                        FIXTURE=str(self.fixture))
        self.env.pop("GH_TOKEN", None)

    def cli(self, *args):
        (self.runtime / "config.json").write_text(json.dumps(self.config))
        return subprocess.run([sys.executable, str(AGENT), "--runtime", str(self.runtime), *args],
                              env=self.env, capture_output=True, text=True)

    def set_fixture(self, runs=None, jobs=None, **extra):
        data = json.loads(self.fixture.read_text())
        if runs is not None:
            data["runs"] = runs
        if jobs is not None:
            data["jobs"] = jobs
        data.update(extra)
        self.fixture.write_text(json.dumps(data))

    def assert_poll(self, status):
        result = self.cli("poll", "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], status)

    def test_successful_main_backend_can_deploy_without_mutation_in_dry_run(self):
        self.assert_poll("ready")
        self.assertFalse((self.runtime / "source").exists())
        self.assertFalse((self.runtime / "state" / "deployed-sha").exists())

    def test_disabled_agent_does_not_contact_github(self):
        self.config["enabled"] = False
        self.set_fixture(api_error=True)
        self.assert_poll("disabled")

    def test_newer_failed_run_cannot_be_hidden_by_old_success(self):
        self.set_fixture(runs=[run_fixture(), run_fixture(id=124, run_number=8, conclusion="failure")])
        self.assert_poll("ci-not-ready")

    def test_in_progress_rerun_of_successful_run_blocks_deployment(self):
        self.set_fixture(runs=[run_fixture(run_attempt=2, status="in_progress", conclusion=None)])
        self.assert_poll("ci-not-ready")

    def test_pr_and_wrong_branch_sha_or_repo_never_qualify(self):
        for changes in ({"event": "pull_request"}, {"head_branch": "feature"},
                        {"head_sha": "b" * 40}, {"repository": {"full_name": "other/repo"}}):
            with self.subTest(changes=changes):
                self.set_fixture(runs=[run_fixture(**changes)])
                self.assert_poll("ci-not-ready")

    def test_skipped_or_missing_backend_job_is_not_deployable(self):
        for jobs in ([], [{"name": "backend", "status": "completed", "conclusion": "skipped"}],
                     [{"name": "infra", "status": "completed", "conclusion": "success"}]):
            with self.subTest(jobs=jobs):
                self.set_fixture(jobs=jobs)
                self.assert_poll("ci-not-ready")

    def test_manual_workflow_on_main_can_qualify(self):
        self.set_fixture(runs=[run_fixture(event="workflow_dispatch")])
        self.assert_poll("ready")

    def test_already_deployed_sha_does_not_need_api(self):
        (self.runtime / "state" / "deployed-sha").write_text(SHA)
        self.set_fixture(api_error=True)
        self.assert_poll("unchanged")

    def test_failed_sha_is_not_retried_every_minute(self):
        (self.runtime / "state" / "failed-sha").write_text(SHA)
        self.assert_poll("failed-version")

    def test_api_failure_never_marks_version_deployed_or_failed(self):
        self.set_fixture(api_error=True)
        result = self.cli("poll", "--dry-run")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.runtime / "state" / "deployed-sha").exists())
        self.assertFalse((self.runtime / "state" / "failed-sha").exists())

    def test_invalid_sha_is_rejected_before_docker(self):
        result = self.cli("deploy", "--sha", "latest")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA", result.stderr)

    def test_init_does_not_overwrite_existing_runtime_settings(self):
        result = self.cli("init", "--repo", REPO, "--branch", "master")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads((self.runtime / "config.json").read_text()), self.config)


if __name__ == "__main__":
    unittest.main()
