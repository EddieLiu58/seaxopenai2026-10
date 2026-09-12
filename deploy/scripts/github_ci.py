"""Read-only GitHub CI checks. Use system curl's TLS trust on macOS."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlencode, quote


class GitHubCI:
    def __init__(self, config, runtime):
        self.config = config
        self.runtime = runtime

    def get(self, path):
        token_file = self.runtime / "github-token"
        token = os.environ.get("GH_TOKEN", "")
        if not token and token_file.exists():
            if token_file.stat().st_mode & 0o077:
                raise RuntimeError("github-token must have permissions 600")
            token = token_file.read_text().strip()
        if "\n" in token or "\r" in token:
            raise RuntimeError("Invalid GitHub token")
        headers = ["Accept: application/vnd.github+json", "User-Agent: seax-local-deploy"]
        if token:
            headers.append("Authorization: Bearer " + token)
        # Secrets go through stdin, not shell expansion, process arguments or logs.
        curl_config = "\n".join("header = " + json.dumps(h) for h in headers)
        result = subprocess.run(
            ["curl", "--fail", "--silent", "--show-error", "--max-time", "30",
             "--config", "-", "https://api.github.com/" + path],
            input=curl_config, text=True, capture_output=True, timeout=35)
        if result.returncode:
            raise RuntimeError("GitHub API unavailable, unauthorized, or rate limited; no deployment")
        return json.loads(result.stdout)

    def successful_run(self, sha):
        repo, branch = self.config["repo"], self.config["branch"]
        workflow = quote(self.config["workflow"], safe="")
        query = urlencode({"branch": branch, "head_sha": sha, "per_page": 100})
        data = self.get(f"repos/{repo}/actions/workflows/{workflow}/runs?{query}")
        runs = [run for run in data["workflow_runs"]
                if run.get("head_sha") == sha and run.get("head_branch") == branch
                and run.get("event") in ("push", "workflow_dispatch")
                and run.get("repository", {}).get("full_name", "").lower() == repo.lower()]
        if not runs:
            return None
        latest = max(runs, key=lambda run: (run["run_number"], run.get("run_attempt", 1)))
        if latest["status"] != "completed" or latest["conclusion"] != "success":
            return None
        # A successful infra-only workflow, skipped backend, or PR CI is insufficient.
        page = 1
        while True:
            data = self.get(f"repos/{repo}/actions/runs/{int(latest['id'])}/jobs?filter=latest&per_page=100&page={page}")
            matches = [job for job in data["jobs"] if job["name"] == self.config["required_job"]]
            if matches:
                return latest if all(job["status"] == "completed" and job["conclusion"] == "success"
                                     for job in matches) else None
            if page * 100 >= data["total_count"]:
                return None
            page += 1
