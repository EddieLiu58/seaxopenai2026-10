#!/usr/bin/env python3
"""macOS-local CD for a public repository; never exposes a deployment endpoint."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys

from github_ci import GitHubCI


SHA_PATTERN = re.compile(r"[0-9a-f]{40}")
DEFAULT_REPO = "EddieLiu58/seaxopenai2026-10"
SCRIPTS = Path(__file__).resolve().parent


def run(command, *, cwd=None, env=None, capture=False, timeout=180, output=None):
    result = subprocess.run(command, cwd=cwd, env=env, text=output is None,
                            stdout=subprocess.PIPE if capture else (output or sys.stderr),
                            stderr=subprocess.PIPE if capture else sys.stderr, timeout=timeout)
    if result.returncode:
        # Do not print environments or credential-bearing command lines.
        raise RuntimeError(f"{Path(command[0]).name} failed (exit {result.returncode})")
    return result.stdout if capture else None


def validate_sha(sha):
    if not SHA_PATTERN.fullmatch(sha):
        raise RuntimeError("Expected a full 40-character lowercase commit SHA")
    return sha


def load_config(runtime):
    config = json.loads((runtime / "config.json").read_text())
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", config["repo"]):
        raise RuntimeError("Invalid GitHub owner/repo")
    branch = config["branch"]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", branch) or ".." in branch:
        raise RuntimeError("Invalid deployment branch")
    if not isinstance(config["enabled"], bool):
        raise RuntimeError("enabled must be a JSON boolean")
    return config


def state_read(runtime, name):
    path = runtime / "state" / name
    return path.read_text().strip() if path.exists() else ""


def state_write(runtime, name, value):
    path = runtime / "state" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(value + "\n")
    temp.replace(path)


@contextmanager
def deployment_lock(runtime):
    (runtime / "state").mkdir(exist_ok=True)
    with (runtime / "state" / "deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Deployment busy: another agent or manual deploy holds the lock")
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def remote_head(config):
    ref = "refs/heads/" + config["branch"]
    result = run(["git", "ls-remote", "--exit-code",
                  f"https://github.com/{config['repo']}.git", ref], capture=True, timeout=40)
    lines = [line.split() for line in result.splitlines()]
    heads = [parts[0] for parts in lines if len(parts) == 2 and parts[1] == ref]
    if len(heads) != 1:
        raise RuntimeError("Deployment branch not found")
    return validate_sha(heads[0])


class Engine:
    def __init__(self, runtime, config):
        self.runtime = runtime
        self.config = config

    def compose(self, *args, image=None, capture=False, output=None):
        # Compose .env must not be overridden by a developer's database variables.
        inherited = ("PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG",
                     "LANG", "TMPDIR", "SSH_AUTH_SOCK")
        env = {key: os.environ[key] for key in inherited if key in os.environ}
        env["BACKEND_IMAGE"] = image or state_read(self.runtime, "current-image") or "seax-backend:unconfigured"
        return run(["docker", "compose", "-p", "seax-poc", "--env-file", str(self.runtime / ".env"),
                    "-f", str(self.runtime / "compose.yaml"), *args],
                   env=env, capture=capture, output=output, timeout=300)

    def checkout(self, sha):
        source = self.runtime / "source"
        url = f"https://github.com/{self.config['repo']}.git"
        if not source.exists():
            run(["git", "clone", "--", url, str(source)], timeout=120)
            (source / ".git" / "seax-managed-checkout").write_text(url)
        marker = source / ".git" / "seax-managed-checkout"
        if not marker.exists() or marker.read_text() != url:
            raise RuntimeError("Refusing to modify a checkout not created by this deployment agent")
        origin = run(["git", "remote", "get-url", "origin"], cwd=source, capture=True).strip()
        if origin != url or run(["git", "status", "--porcelain"], cwd=source, capture=True).strip():
            raise RuntimeError("Deployment checkout origin changed or checkout is dirty; resolve manually")
        run(["git", "fetch", "origin", "refs/heads/" + self.config["branch"]], cwd=source, timeout=120)
        head = run(["git", "rev-parse", "FETCH_HEAD"], cwd=source, capture=True).strip()
        if head != sha:
            raise RuntimeError("Branch moved before checkout; retry with the latest CI result")
        run(["git", "checkout", "--detach", sha], cwd=source)
        return source

    def backup(self):
        backups = self.runtime / "backups"
        backups.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        path = backups / (stamp + ".dump")
        try:
            with path.open("xb") as output:
                os.chmod(path, 0o600)
                self.compose("exec", "-T", "postgres", "pg_dump", "-U", "seax", "-d", "seax", "-Fc", output=output)
            if path.stat().st_size == 0:
                raise RuntimeError("Database backup was empty")
        except Exception:
            path.unlink(missing_ok=True)
            raise
        return path

    def replace_backend(self, image):
        previous = state_read(self.runtime, "current-image")
        try:
            self.compose("up", "-d", "--no-deps", "--wait", "--wait-timeout", "180", "backend", image=image)
        except Exception as failure:
            if previous and self.config.get("auto_rollback", False):
                self.compose("up", "-d", "--no-deps", "--wait", "--wait-timeout", "180", "backend", image=previous)
                raise RuntimeError("Candidate failed readiness; previous image restored") from failure
            raise RuntimeError("Candidate failed readiness; manual recovery required (no automatic schema rollback)") from failure
        state_write(self.runtime, "previous-image", previous)
        state_write(self.runtime, "current-image", image)

    def deploy(self, sha):
        source = self.checkout(sha)
        env = dict(os.environ, SEAX_SOURCE_DIR=str(source))
        run(["bash", str(self.runtime / "tools" / "verify.sh")], cwd=source, env=env, timeout=1800)
        image = "seax-backend:" + sha
        # Use the locally reviewed Dockerfile installed at init, not a changing infra file.
        run(["docker", "build", "-f", str(self.runtime / "tools" / "backend.Dockerfile"),
             "--label", "org.opencontainers.image.revision=" + sha, "-t", image, str(source / "backend")], timeout=600)
        if remote_head(self.config) != sha:
            return {"status": "superseded", "sha": sha}
        previous_sha = state_read(self.runtime, "deployed-sha")
        if previous_sha:
            changes = run(["git", "diff", "--name-only", previous_sha, sha, "--",
                           "backend/src/main/resources/db/migration"], cwd=source, capture=True)
            if changes.strip():
                raise RuntimeError("Migration changed: use a reviewed maintenance deployment, not automatic CD")
        self.compose("up", "-d", "--wait", "--wait-timeout", "90", "postgres", image=image)
        backup = self.backup()
        self.replace_backend(image)
        state_write(self.runtime, "deployed-sha", sha)
        state_write(self.runtime, "deployed-at", datetime.now(timezone.utc).isoformat())
        return {"status": "deployed", "sha": sha, "backup": str(backup)}

    def tunnel_url(self):
        container = self.compose("ps", "-q", "cloudflared", capture=True).strip()
        if not container:
            raise RuntimeError("Quick Tunnel is not running; start the tunnel profile first")
        started = run(["docker", "inspect", "--format", "{{.State.StartedAt}}", container], capture=True).strip()
        logs = self.compose("logs", "--no-color", "--since", started, "cloudflared", capture=True)
        urls = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", logs)
        if not urls:
            raise RuntimeError("No URL from the current cloudflared start; wait a few seconds and retry")
        state_write(self.runtime, "tunnel-url.txt", urls[-1])
        return {"status": "tunnel", "url": urls[-1]}


def poll(runtime, config, *, dry_run=False, check_disabled=False, explicit_sha=None):
    if not config["enabled"] and not check_disabled:
        return {"status": "disabled"}
    sha = remote_head(config)
    if explicit_sha and sha != explicit_sha:
        raise RuntimeError("Requested SHA is not the latest deployment branch commit")
    if not explicit_sha and state_read(runtime, "deployed-sha") == sha:
        return {"status": "unchanged", "sha": sha}
    if not explicit_sha and state_read(runtime, "failed-sha") == sha:
        return {"status": "failed-version", "sha": sha}
    ci_run = GitHubCI(config, runtime).successful_run(sha)
    if ci_run is None:
        return {"status": "ci-not-ready", "sha": sha}
    if dry_run:
        return {"status": "ready", "sha": sha, "ci_run": ci_run["html_url"]}
    try:
        result = Engine(runtime, config).deploy(sha)
    except Exception:
        state_write(runtime, "failed-sha", sha)
        raise
    if result["status"] == "deployed":
        state_write(runtime, "ci-run-url", ci_run["html_url"])
        (runtime / "state" / "failed-sha").unlink(missing_ok=True)
    return result


def init_runtime(runtime, repo, branch):
    if (runtime / "config.json").exists() or (runtime / ".env").exists():
        raise RuntimeError("Runtime is already initialized; existing configuration will not be overwritten")
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ("state", "backups", "tools"):
        (runtime / name).mkdir(exist_ok=True, mode=0o700)
    config = {"repo": repo, "branch": branch, "workflow": "backend-ci.yml",
              "required_job": "backend", "enabled": False, "auto_rollback": False}
    (runtime / "config.json").write_text(json.dumps(config, indent=2) + "\n")
    load_config(runtime)
    deploy_root = SCRIPTS.parent
    shutil.copyfile(deploy_root / "compose.yaml", runtime / "compose.yaml")
    for script in ("agent.py", "github_ci.py", "verify.sh"):
        shutil.copyfile(SCRIPTS / script, runtime / "tools" / script)
    shutil.copyfile(deploy_root.parent / "backend" / "Dockerfile", runtime / "tools" / "backend.Dockerfile")
    example = (deploy_root / ".env.example").read_text().replace(
        "replace-with-a-random-local-password", secrets.token_urlsafe(32))
    fd = os.open(runtime / ".env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write(example)
    return {"status": "initialized-disabled", "runtime": str(runtime)}


def write_agent_plist(runtime):
    import plistlib
    payload = {
        "Label": "com.seax.poc-deploy",
        "ProgramArguments": [sys.executable, str(runtime / "tools" / "agent.py"),
                             "--runtime", str(runtime), "poll"],
        "WorkingDirectory": str(runtime), "StartInterval": 60, "RunAtLoad": True,
        "EnvironmentVariables": {"PATH": os.environ["PATH"]},
        "StandardOutPath": str(runtime / "state" / "agent.log"),
        "StandardErrorPath": str(runtime / "state" / "agent-error.log"),
    }
    path = runtime / "com.seax.poc-deploy.plist"
    with path.open("wb") as output:
        plistlib.dump(payload, output)
    return {"status": "plist-created", "path": str(path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path.home() / "seax-poc-runtime")
    commands = parser.add_subparsers(dest="command", required=True)
    initialize = commands.add_parser("init")
    initialize.add_argument("--repo", default=DEFAULT_REPO)
    initialize.add_argument("--branch", default="master")
    polling = commands.add_parser("poll")
    polling.add_argument("--dry-run", action="store_true")
    commands.add_parser("check-ci")
    manual = commands.add_parser("deploy")
    manual.add_argument("--sha", required=True)
    manual.add_argument("--dry-run", action="store_true")
    commands.add_parser("url")
    commands.add_parser("start-tunnel")
    commands.add_parser("stop-tunnel")
    commands.add_parser("make-plist")
    commands.add_parser("enable")
    commands.add_parser("disable")
    commands.add_parser("retry")
    args = parser.parse_args()
    runtime = args.runtime.expanduser().resolve()
    try:
        if args.command == "init":
            result = init_runtime(runtime, args.repo, args.branch)
        else:
            if args.command == "deploy":
                validate_sha(args.sha)
            config = load_config(runtime)
            if args.command == "make-plist":
                result = write_agent_plist(runtime)
            elif args.command == "url":
                result = Engine(runtime, config).tunnel_url()
            elif args.command in ("start-tunnel", "stop-tunnel"):
                with deployment_lock(runtime):
                    engine = Engine(runtime, config)
                    if args.command == "start-tunnel":
                        if not state_read(runtime, "current-image"):
                            raise RuntimeError("No application image deployed; use the separate smoke tunnel first")
                        engine.compose("--profile", "tunnel", "up", "-d", "--no-deps", "cloudflared")
                    else:
                        engine.compose("--profile", "tunnel", "stop", "cloudflared")
                    result = {"status": args.command}
            else:
                with deployment_lock(runtime):
                    if args.command in ("enable", "disable"):
                        config["enabled"] = args.command == "enable"
                        (runtime / "config.json").write_text(json.dumps(config, indent=2) + "\n")
                        result = {"status": args.command + "d"}
                    elif args.command == "retry":
                        (runtime / "state" / "failed-sha").unlink(missing_ok=True)
                        result = {"status": "retry-cleared"}
                    else:
                        result = poll(runtime, config, dry_run=getattr(args, "dry_run", False) or args.command == "check-ci",
                                      check_disabled=args.command in ("check-ci", "deploy"),
                                      explicit_sha=getattr(args, "sha", None))
        print(json.dumps(result))
        return 0
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as exc:
        print("Deployment: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
