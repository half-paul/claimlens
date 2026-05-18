export const ARTICLE_SCORES = [
  "Unreviewed",
  "True",
  "Mostly true",
  "Partly true",
  "Misleading",
  "Mostly false",
  "False"
] as const;

export const ANNOTATION_CLASSIFICATIONS = [
  "False",
  "Misleading",
  "Partly true",
  "Missing context",
  "Disputed",
  "Needs citation"
] as const;

export type ArticleScore = (typeof ARTICLE_SCORES)[number];
export type AnnotationClassification = (typeof ANNOTATION_CLASSIFICATIONS)[number];

export type Role = "Admin" | "Reviewer" | "Visitor";
export type ArticleStatus = "active" | "archived";
export type AnnotationStatus = "pending" | "approved" | "hidden";

export type Sentence = {
  text: string;
  start_offset: number;
  end_offset: number;
};

export type Paragraph = {
  text: string;
  start_offset: number;
  end_offset: number;
  sentences: Sentence[];
};

export type Section = {
  title: string;
  paragraphs: Paragraph[];
};

export type Article = {
  id: string;
  source_url: string;
  canonical_url: string;
  source_site: string;
  title: string;
  raw_html: string;
  cleaned_text: string;
  structured_content_json: Section[];
  imported_by_user_id: string;
  imported_at: string;
  source_revision_id?: string;
  article_score: ArticleScore;
  article_summary: string;
  status: ArticleStatus;
};

export type Reference = {
  id: string;
  annotation_id: string;
  url: string;
  title: string;
  source_name: string;
  quote_or_summary: string;
  added_by_user_id: string;
  created_at: string;
};

export type Annotation = {
  id: string;
  article_id: string;
  selected_text: string;
  start_offset: number;
  end_offset: number;
  section_title: string;
  paragraph_index: number;
  sentence_index: number | null;
  selection_scope: "word" | "sentence" | "paragraph";
  classification: AnnotationClassification;
  annotation_score: ArticleScore;
  comment: string;
  created_by_user_id: string;
  created_at: string;
  status: AnnotationStatus;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
};

export type Db = {
  articles: Article[];
  annotations: Annotation[];
  references: Reference[];
  users: User[];
  allowed_domains: string[];
};
