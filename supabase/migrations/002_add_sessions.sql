-- 세션그룹: 녹음 on/off 단위
CREATE TABLE session_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  group_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_session_groups_project ON session_groups(project_id);

-- 세션: 침묵 기준 자동 분리 단위
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_group_id UUID NOT NULL REFERENCES session_groups(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  session_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_group ON sessions(session_group_id);

-- transcriptions에 세션 연결 컬럼 추가
ALTER TABLE transcriptions ADD COLUMN session_id UUID REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE transcriptions ADD COLUMN clock_time TIMESTAMPTZ;

CREATE INDEX idx_transcriptions_session ON transcriptions(session_id);
