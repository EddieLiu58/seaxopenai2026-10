-- Serialize feedback execution across projects as well as within each project.
CREATE UNIQUE INDEX one_running_feedback_globally ON jobs ((type))
  WHERE type = 'FEEDBACK' AND status = 'RUNNING';

-- A diff belongs to one report/project pair and one committed report transition.
ALTER TABLE reports ADD CONSTRAINT reports_project_identity UNIQUE (id, project_id);
ALTER TABLE jobs ADD CONSTRAINT jobs_project_identity UNIQUE (id, project_id);
ALTER TABLE report_diffs ADD CONSTRAINT report_diffs_version_unique UNIQUE (report_id, to_version);
ALTER TABLE report_diffs ADD CONSTRAINT report_diffs_report_identity
  FOREIGN KEY (report_id, project_id) REFERENCES reports(id, project_id);
ALTER TABLE report_diffs ADD CONSTRAINT report_diffs_job_identity
  FOREIGN KEY (job_id, project_id) REFERENCES jobs(id, project_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE report_diffs ADD CONSTRAINT report_diffs_memory
  FOREIGN KEY (global_memory_version) REFERENCES global_memory(version);
ALTER TABLE global_memory ADD CONSTRAINT memory_source_project
  FOREIGN KEY (source_project_id) REFERENCES projects(id);
ALTER TABLE feedback_records ADD CONSTRAINT feedback_memory
  FOREIGN KEY (global_memory_version) REFERENCES global_memory(version);

-- Remove the internal authority field from successful responses persisted by V1.
UPDATE idempotency_records
SET response = response #- '{job,executionToken}' #- '{feedbackJob,executionToken}'
WHERE response->'job' ? 'executionToken' OR response->'feedbackJob' ? 'executionToken';

CREATE FUNCTION reject_immutable_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER global_memory_append_only BEFORE UPDATE OR DELETE ON global_memory
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
CREATE TRIGGER report_diffs_append_only BEFORE UPDATE OR DELETE ON report_diffs
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
CREATE TRIGGER idempotency_records_append_only BEFORE UPDATE OR DELETE ON idempotency_records
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_mutation();
