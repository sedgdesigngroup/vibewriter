-- users: 간단한 ID 기반 인증
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_users_user_id ON users(user_id);

-- projects: 녹음 프로젝트
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL REFERENCES users(user_id),
  date DATE NOT NULL,
  sequence_number INTEGER NOT NULL,
  file_name VARCHAR(300) NOT NULL,
  status VARCHAR(20) DEFAULT 'recording' NOT NULL,
  total_duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, date, sequence_number)
);

CREATE INDEX idx_projects_user_date ON projects(user_id, date);

-- transcriptions: 전사 텍스트
CREATE TABLE transcriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  timestamp_seconds REAL NOT NULL,
  segment_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_transcriptions_project ON transcriptions(project_id);
CREATE INDEX idx_transcriptions_order ON transcriptions(project_id, segment_order);

-- template_results: GPT 가공 결과
CREATE TABLE template_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_type VARCHAR(30) NOT NULL,
  content TEXT,
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, template_type)
);

CREATE INDEX idx_templates_project ON template_results(project_id);
