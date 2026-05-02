-- Add http_status to ai_usage_log so upstream error codes (503, 429, etc.)
-- can be queried directly without string-matching error_message.
ALTER TABLE ai_usage_log
  ADD COLUMN http_status int;

CREATE INDEX idx_ai_usage_status ON ai_usage_log (http_status)
  WHERE http_status IS NOT NULL;
