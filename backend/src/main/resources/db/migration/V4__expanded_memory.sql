-- Preserve V1 memory rows as legacy snapshots; only newly published versions have extensions.
CREATE TABLE memory_initial_sources (
  version integer PRIMARY KEY REFERENCES global_memory(version) CHECK (version = 1),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
CREATE TABLE memory_extensions (
  version integer PRIMARY KEY REFERENCES global_memory(version),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND NOT payload ? 'projectExperiences')
);
CREATE TABLE experiences (
  project_id uuid PRIMARY KEY REFERENCES projects(id),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object')
);
CREATE TABLE memory_experiences (
  version integer NOT NULL REFERENCES memory_extensions(version),
  project_id uuid NOT NULL REFERENCES experiences(project_id),
  PRIMARY KEY(version, project_id)
);
CREATE TABLE analysis_results (
  analysis_id uuid PRIMARY KEY,
  job_id uuid NOT NULL UNIQUE,
  project_id uuid NOT NULL,
  report_version bigint NOT NULL CHECK (report_version > 0),
  global_memory_version integer NOT NULL REFERENCES global_memory(version),
  results jsonb NOT NULL CHECK (jsonb_typeof(results) = 'array'),
  FOREIGN KEY(job_id, project_id) REFERENCES jobs(id, project_id)
);
CREATE INDEX analysis_results_project_version ON analysis_results(project_id, report_version, analysis_id);
CREATE TABLE feedback_results (
  job_id uuid PRIMARY KEY REFERENCES jobs(id),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
CREATE TRIGGER memory_extensions_append_only BEFORE UPDATE OR DELETE ON memory_extensions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
CREATE TRIGGER memory_initial_sources_append_only BEFORE UPDATE OR DELETE ON memory_initial_sources
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
CREATE TRIGGER experiences_append_only BEFORE UPDATE OR DELETE ON experiences
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
CREATE TRIGGER memory_experiences_append_only BEFORE UPDATE OR DELETE ON memory_experiences
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
CREATE TRIGGER analysis_results_append_only BEFORE UPDATE OR DELETE ON analysis_results
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
CREATE TRIGGER feedback_results_append_only BEFORE UPDATE OR DELETE ON feedback_results
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
