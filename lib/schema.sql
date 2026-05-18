CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Reviewer', 'Visitor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS allowed_domains (
  domain TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  source_site TEXT NOT NULL,
  title TEXT NOT NULL,
  raw_html TEXT NOT NULL,
  cleaned_text TEXT NOT NULL,
  structured_content_json JSONB NOT NULL,
  imported_by_user_id TEXT NOT NULL REFERENCES users(id),
  imported_at TIMESTAMPTZ NOT NULL,
  source_revision_id TEXT,
  article_score TEXT NOT NULL DEFAULT 'Unreviewed' CHECK (
    article_score IN ('Unreviewed', 'True', 'Mostly true', 'Partly true', 'Misleading', 'Mostly false', 'False')
  ),
  article_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS articles_title_idx ON articles USING GIN (to_tsvector('english', title || ' ' || cleaned_text));

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  selected_text TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  section_title TEXT NOT NULL,
  paragraph_index INTEGER NOT NULL,
  sentence_index INTEGER,
  selection_scope TEXT NOT NULL DEFAULT 'sentence' CHECK (selection_scope IN ('word', 'sentence', 'paragraph')),
  classification TEXT NOT NULL CHECK (
    classification IN ('False', 'Misleading', 'Partly true', 'Missing context', 'Disputed', 'Needs citation')
  ),
  annotation_score TEXT NOT NULL DEFAULT 'Unreviewed' CHECK (
    annotation_score IN ('Unreviewed', 'True', 'Mostly true', 'Partly true', 'Misleading', 'Mostly false', 'False')
  ),
  comment TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden'))
);

ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS selection_scope TEXT NOT NULL DEFAULT 'sentence',
  ADD COLUMN IF NOT EXISTS annotation_score TEXT NOT NULL DEFAULT 'Unreviewed';

CREATE INDEX IF NOT EXISTS annotations_article_id_idx ON annotations(article_id);
CREATE INDEX IF NOT EXISTS annotations_offsets_idx ON annotations(article_id, start_offset, end_offset);

CREATE TABLE IF NOT EXISTS annotation_references (
  id TEXT PRIMARY KEY,
  annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL DEFAULT '',
  quote_or_summary TEXT NOT NULL DEFAULT '',
  added_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS annotation_references_annotation_id_idx ON annotation_references(annotation_id);

INSERT INTO users (id, name, email, role, status)
VALUES
  ('user-admin', 'Admin', 'admin@example.local', 'Admin', 'active'),
  ('user-reviewer', 'Reviewer', 'reviewer@example.local', 'Reviewer', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO allowed_domains (domain)
VALUES ('wikipedia.org'), ('britannica.com')
ON CONFLICT (domain) DO NOTHING;
