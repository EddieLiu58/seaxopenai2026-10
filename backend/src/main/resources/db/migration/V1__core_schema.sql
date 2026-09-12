CREATE TABLE global_memory (
  version integer PRIMARY KEY, departments jsonb NOT NULL, relationships_description text NOT NULL,
  source varchar(16) NOT NULL, source_project_id uuid UNIQUE NULL, created_at timestamptz NOT NULL
);
CREATE TABLE projects (
  id uuid PRIMARY KEY, name varchar(200) NOT NULL, status varchar(8) NOT NULL, created_at timestamptz NOT NULL, closed_at timestamptz NULL
);
CREATE TABLE user_docs (project_id uuid PRIMARY KEY REFERENCES projects(id), content text NOT NULL, created_at timestamptz NOT NULL);
CREATE TABLE reports (id uuid PRIMARY KEY, project_id uuid UNIQUE NOT NULL REFERENCES projects(id), version bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE workflows (
  id uuid PRIMARY KEY, report_id uuid NOT NULL REFERENCES reports(id), name varchar(200) NOT NULL, description text NOT NULL,
  assignment_status varchar(16) NOT NULL, department_id uuid NULL, assignment_source varchar(8) NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  UNIQUE(report_id,id),
  CHECK ((assignment_status = 'ASSIGNED' AND department_id IS NOT NULL AND assignment_source IS NOT NULL AND assignment_source IN ('AI','USER')) OR
         (assignment_status = 'UNKNOWN' AND department_id IS NULL AND assignment_source IS NOT NULL AND assignment_source IN ('AI','USER')) OR
         (assignment_status = 'UNASSIGNED' AND department_id IS NULL AND assignment_source IS NULL))
);
CREATE TABLE workflow_dependencies (
  report_id uuid NOT NULL REFERENCES reports(id), workflow_id uuid NOT NULL, depends_on_workflow_id uuid NOT NULL,
  PRIMARY KEY(workflow_id, depends_on_workflow_id), CHECK (workflow_id <> depends_on_workflow_id),
  FOREIGN KEY(report_id, workflow_id) REFERENCES workflows(report_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(report_id, depends_on_workflow_id) REFERENCES workflows(report_id,id) ON DELETE RESTRICT
);
CREATE TABLE report_diffs (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), report_id uuid NOT NULL REFERENCES reports(id),
 event_type varchar(32) NOT NULL, phase varchar(8) NOT NULL, source varchar(8) NOT NULL, actor_id uuid NULL, reason text NULL, job_id uuid NULL,
 global_memory_version integer NULL, from_version bigint NOT NULL, to_version bigint NOT NULL, changes jsonb NOT NULL, created_at timestamptz NOT NULL,
 CHECK(to_version=from_version+1)
);
CREATE TABLE jobs (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), type varchar(32) NOT NULL, status varchar(16) NOT NULL,
 attempts integer NOT NULL, max_attempts integer NOT NULL, batch integer NOT NULL, next_retry_at timestamptz NULL,
 global_memory_version integer NULL, input_report_version bigint NOT NULL, input jsonb NOT NULL, result jsonb NULL, error jsonb NULL,
 created_at timestamptz NOT NULL, started_at timestamptz NULL, finished_at timestamptz NULL,
 lease_until timestamptz NULL, execution_token uuid NULL
);
CREATE UNIQUE INDEX one_active_analysis_per_project ON jobs(project_id) WHERE type IN ('INITIAL_ANALYSIS','ALL_REANALYZE','UNASSIGNED_ANALYZE') AND status IN ('QUEUED','RUNNING','RETRY_WAIT');
CREATE UNIQUE INDEX one_feedback_per_project ON jobs(project_id) WHERE type='FEEDBACK';
CREATE INDEX runnable_jobs ON jobs(status, next_retry_at, created_at);
CREATE TABLE job_attempts (id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES jobs(id), batch integer NOT NULL, attempt integer NOT NULL, execution_token uuid NOT NULL, global_memory_version integer NULL, started_at timestamptz NOT NULL, finished_at timestamptz NULL, error jsonb NULL, UNIQUE(job_id,batch,attempt));
CREATE TABLE idempotency_records (path text NOT NULL, key uuid NOT NULL, canonical_body jsonb NOT NULL, status integer NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL, PRIMARY KEY(path,key));
CREATE TABLE feedback_records (project_id uuid PRIMARY KEY REFERENCES projects(id), global_memory_version integer NOT NULL, created_at timestamptz NOT NULL);
