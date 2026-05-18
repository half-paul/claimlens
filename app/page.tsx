"use client";

import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  FileSearch,
  Globe2,
  LinkIcon,
  ListFilter,
  ShieldCheck
} from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";
import {
  ANNOTATION_CLASSIFICATIONS,
  ARTICLE_SCORES,
  type Annotation,
  type AnnotationClassification,
  type Article,
  type ArticleScore,
  type Reference,
  type Section
} from "@/lib/types";

type ArticlePayload = {
  article: Article;
  annotations: Annotation[];
  references: Reference[];
};

type SelectionDraft = {
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
  references: { url: string; title: string; source_name: string; quote_or_summary: string }[];
};

type SelectionScope = SelectionDraft["selection_scope"];
type AppRole = "visitor" | "reviewer" | "admin";

const scoreTone: Record<ArticleScore, string> = {
  Unreviewed: "scoreNeutral",
  True: "scoreGood",
  "Mostly true": "scoreGood",
  "Partly true": "scoreMixed",
  Misleading: "scoreWarn",
  "Mostly false": "scoreBad",
  False: "scoreBad"
};

const roleRank: Record<AppRole, number> = {
  visitor: 0,
  reviewer: 1,
  admin: 2
};

function canAccess(role: AppRole, required: AppRole) {
  return roleRank[role] >= roleRank[required];
}

function roleHeaders(role: AppRole): HeadersInit {
  return process.env.NEXT_PUBLIC_E2E_AUTH_ROLE ? { "x-test-role": role } : {};
}

function SplashNav() {
  return (
    <header className="splashNav">
      <div>
        <p className="eyebrow">Human-reviewed encyclopedia commentary</p>
        <strong>ClaimLens</strong>
      </div>
      <a className="buttonLink" href="/sign-in">
        Login
      </a>
    </header>
  );
}

function SplashPage() {
  return (
    <main className="splashPage">
      <SplashNav />
      <section className="splashHero">
        <div className="splashCopy">
          <p className="eyebrow">Article verification workspace</p>
          <h1>Review encyclopedia claims with human judgment first.</h1>
          <p>
            Import Wikipedia or Britannica snapshots, preserve the original article view, and let authorized reviewers
            flag words, sentences, or paragraphs with comments, references, and scores.
          </p>
          <div className="splashActions">
            <a className="buttonLink primaryLink" href="/sign-in">
              Login
            </a>
            <a className="buttonLink" href="/sign-up">
              Request access
            </a>
          </div>
        </div>
        <div className="splashPreview" aria-hidden="true">
          <div className="previewToolbar">
            <span>Unreviewed</span>
            <span>12 flags</span>
            <span>8 approved</span>
          </div>
          <div className="previewArticle">
            <h2>Encyclopedia Article</h2>
            <p>
              Reviewers can select precise claims and attach independent commentary while the stored source page stays
              readable in its original form.
            </p>
            <p>
              <mark>Flagged claim</mark> opens a commentary panel with score, references, and moderation state.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const hasTestRole = Boolean(process.env.NEXT_PUBLIC_E2E_AUTH_ROLE);
  const [articles, setArticles] = useState<Article[]>([]);
  const [active, setActive] = useState<ArticlePayload | null>(null);
  const [query, setQuery] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"visitor" | "reviewer" | "admin">("visitor");
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [selectionScope, setSelectionScope] = useState<SelectionScope>("sentence");
  const [openAnnotationId, setOpenAnnotationId] = useState<string | null>(null);
  const [score, setScore] = useState<ArticleScore>("Unreviewed");
  const [summary, setSummary] = useState("");
  const [domains, setDomains] = useState("wikipedia.org");
  const [authReady, setAuthReady] = useState(hasTestRole);
  const [isAuthenticated, setIsAuthenticated] = useState(hasTestRole);
  const [userRole, setUserRole] = useState<AppRole>(() => {
    const testRole = process.env.NEXT_PUBLIC_E2E_AUTH_ROLE;
    return testRole === "admin" || testRole === "reviewer" || testRole === "visitor" ? testRole : "visitor";
  });
  const availableModes = useMemo(
    () => (["visitor", "reviewer", "admin"] as const).filter((item) => canAccess(userRole, item)),
    [userRole]
  );

  useEffect(() => {
    void loadArticles();
    void loadSession();
  }, []);

  useEffect(() => {
    if (!canAccess(userRole, mode)) {
      setMode(availableModes[availableModes.length - 1] ?? "visitor");
    }
    if (canAccess(userRole, "admin")) void loadDomains();
  }, [availableModes, mode, userRole]);

  useEffect(() => {
    if (active?.article) {
      setScore(active.article.article_score);
      setSummary(active.article.article_summary);
    }
  }, [active?.article]);

  const openAnnotation = useMemo(
    () => active?.annotations.find((annotation) => annotation.id === openAnnotationId) ?? null,
    [active, openAnnotationId]
  );

  const openReferences = useMemo(
    () => active?.references.filter((ref) => ref.annotation_id === openAnnotationId) ?? [],
    [active, openAnnotationId]
  );

  const articleStats = useMemo(() => {
    const annotations = active?.annotations ?? [];
    return {
      total: annotations.filter((annotation) => annotation.status !== "hidden").length,
      approved: annotations.filter((annotation) => annotation.status === "approved").length,
      pending: annotations.filter((annotation) => annotation.status === "pending").length,
      hidden: annotations.filter((annotation) => annotation.status === "hidden").length
    };
  }, [active?.annotations]);

  async function loadArticles(search = "") {
    const response = await fetch(`/api/articles?q=${encodeURIComponent(search)}`);
    const data = (await response.json()) as { articles: Article[] };
    setArticles(data.articles);
  }

  async function loadArticle(id: string) {
    const response = await fetch(`/api/articles/${id}`);
    const data = (await response.json()) as ArticlePayload;
    setActive(data);
    setOpenAnnotationId(data.annotations[0]?.id ?? null);
    setNotice("");
  }

  async function loadDomains() {
    const response = await fetch("/api/domains", { headers: roleHeaders(userRole) });
    if (!response.ok) return;
    const data = (await response.json()) as { allowed_domains: string[] };
    setDomains(data.allowed_domains.join("\n"));
  }

  async function loadSession() {
    if (hasTestRole) return;
    try {
      const response = await fetch("/api/me");
      if (!response.ok) return;
      const data = (await response.json()) as { authenticated?: boolean; role?: AppRole };
      setIsAuthenticated(Boolean(data.authenticated));
      if (data.role === "admin" || data.role === "reviewer" || data.role === "visitor") setUserRole(data.role);
    } finally {
      setAuthReady(true);
    }
  }

  async function importArticle(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("Importing article snapshot...");
    try {
      const response = await fetch("/api/articles", {
        method: "POST",
        headers: { "content-type": "application/json", ...roleHeaders(userRole) },
        body: JSON.stringify({ url: importUrl })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import failed");
      await loadArticles();
      await loadArticle(data.article.id);
      setImportUrl("");
      setNotice("Article imported and stored as a reviewable snapshot.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function searchArticles(event: FormEvent) {
    event.preventDefault();
    await loadArticles(query);
    const exact = articles.find((article) => article.source_url === query || article.canonical_url === query);
    if (exact) await loadArticle(exact.id);
  }

  function createDraftFromSelection({
    selectedText,
    startOffset,
    endOffset,
    sectionTitle,
    paragraphIndex,
    sentenceIndex,
    scope
  }: {
    selectedText: string;
    startOffset: number;
    endOffset: number;
    sectionTitle: string;
    paragraphIndex: number;
    sentenceIndex: number | null;
    scope: SelectionScope;
  }) {
    if (!active) return;
    setDraft({
      article_id: active.article.id,
      selected_text: selectedText,
      start_offset: startOffset,
      end_offset: endOffset,
      section_title: sectionTitle,
      paragraph_index: paragraphIndex,
      sentence_index: sentenceIndex,
      selection_scope: scope,
      classification: "Misleading",
      annotation_score: "Misleading",
      comment: "",
      references: [{ url: "", title: "", source_name: "", quote_or_summary: "" }]
    });
  }

  function createDraftFromSentence(section: Section, paragraphIndex: number, sentenceIndex: number) {
    const paragraph = section.paragraphs[paragraphIndex];
    const sentence = paragraph.sentences[sentenceIndex];
    if (selectionScope === "paragraph") {
      return createDraftFromSelection({
        selectedText: paragraph.text,
        startOffset: paragraph.start_offset,
        endOffset: paragraph.end_offset,
        sectionTitle: section.title,
        paragraphIndex,
        sentenceIndex: null,
        scope: "paragraph"
      });
    }
    return createDraftFromSelection({
      selectedText: sentence.text,
      startOffset: sentence.start_offset,
      endOffset: sentence.end_offset,
      sectionTitle: section.title,
      paragraphIndex,
      sentenceIndex,
      scope: "sentence"
    });
  }

  function createDraftFromSourceSelection(selectedText: string) {
    if (!active) return;
    const normalized = selectedText.replace(/\s+/g, " ").trim();
    if (!normalized) return setNotice("Select article text first, then click Flag selected text.");

    for (const section of active.article.structured_content_json) {
      for (const [paragraphIndex, paragraph] of section.paragraphs.entries()) {
        const paragraphIndexOfSelection = paragraph.text.indexOf(normalized);
        if (paragraphIndexOfSelection === -1) continue;
        const startOffset = paragraph.start_offset + paragraphIndexOfSelection;
        const endOffset = startOffset + normalized.length;
        const sentenceIndex = paragraph.sentences.findIndex(
          (sentence) => sentence.start_offset <= startOffset && sentence.end_offset >= endOffset
        );
        return createDraftFromSelection({
          selectedText: normalized,
          startOffset,
          endOffset,
          sectionTitle: section.title,
          paragraphIndex,
          sentenceIndex: sentenceIndex === -1 ? null : sentenceIndex,
          scope: "word"
        });
      }
    }
    setNotice("That exact selection was not found in the stored article text. Try selecting text from the reviewer picker.");
  }

  async function saveAnnotation(event: FormEvent) {
    event.preventDefault();
    if (!draft || !active) return;
    setBusy(true);
    try {
      const response = await fetch("/api/annotations", {
        method: "POST",
        headers: { "content-type": "application/json", ...roleHeaders(userRole) },
        body: JSON.stringify(draft)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save annotation");
      setDraft(null);
      await loadArticle(active.article.id);
      setOpenAnnotationId(data.annotation.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save annotation");
    } finally {
      setBusy(false);
    }
  }

  async function saveScore(event: FormEvent) {
    event.preventDefault();
    if (!active) return;
    const response = await fetch(`/api/articles/${active.article.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...roleHeaders(userRole) },
      body: JSON.stringify({ article_score: score, article_summary: summary })
    });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error ?? "Score update failed");
    setActive({ ...active, article: data.article });
    await loadArticle(active.article.id);
    await loadArticles(query);
    setNotice("Article score saved.");
  }

  async function updateAnnotation(id: string, status: Annotation["status"]) {
    if (!active) return;
    await fetch(`/api/annotations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...roleHeaders(userRole) },
      body: JSON.stringify({ status })
    });
    await loadArticle(active.article.id);
  }

  async function saveDomains(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/domains", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...roleHeaders(userRole) },
      body: JSON.stringify({ allowed_domains: domains.split(/\n|,/g) })
    });
    const data = await response.json();
    if (!response.ok) return setNotice(data.error ?? "Could not save domains");
    setDomains(data.allowed_domains.join("\n"));
    setNotice("Allowed source domains saved.");
  }

  if (!authReady) {
    return (
      <main className="splashPage">
        <SplashNav />
      </main>
    );
  }

  if (!isAuthenticated) {
    return <SplashPage />;
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">Human-reviewed encyclopedia commentary</p>
          <h1>ClaimLens</h1>
        </div>
        <nav className="modeSwitch" aria-label="Mode">
          {availableModes.map((item) => (
            <button className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item)}>
              {item}
            </button>
          ))}
        </nav>
        <div className="authBox">
          <span>{userRole}</span>
          <a className="buttonLink" href="/sign-in">
            Account
          </a>
          {hasTestRole ? (
            <button className="secondary" type="button" onClick={() => setIsAuthenticated(false)}>
              Logout
            </button>
          ) : (
            <SignOutButton redirectUrl="/">
              <button className="secondary" type="button">
                Logout
              </button>
            </SignOutButton>
          )}
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          {canAccess(userRole, "admin") ? (
            <form onSubmit={importArticle} className="panel">
              <div className="panelTitle">
                <Globe2 size={18} />
                <h2>Import</h2>
              </div>
              <input
                value={importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
                placeholder="https://en.wikipedia.org/wiki/... or https://www.britannica.com/..."
                aria-label="Encyclopedia article URL"
              />
              <button disabled={busy || !importUrl.trim()} type="submit">
                Import snapshot
              </button>
            </form>
          ) : null}

          <form onSubmit={searchArticles} className="panel">
            <div className="panelTitle">
              <FileSearch size={18} />
              <h2>Lookup</h2>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Paste URL or search title/topic"
              aria-label="Search"
            />
            <button type="submit">Search stored articles</button>
          </form>

          <div className="articleList">
            {articles.length === 0 ? (
              <div className="empty">No reviewed snapshots yet.</div>
            ) : (
              articles.map((article) => (
                <button
                  className={active?.article.id === article.id ? "articleItem selected" : "articleItem"}
                  key={article.id}
                  onClick={() => loadArticle(article.id)}
                >
                  <span>{article.title}</span>
                  <small>{article.article_score}</small>
                </button>
              ))
            )}
          </div>
        </aside>

        <article className="reader">
          {notice ? <div className="notice">{notice}</div> : null}
          {!active ? (
            <div className="emptyState">
              <ShieldCheck size={42} />
              <h2>Import or open a stored encyclopedia article.</h2>
              <p>This app shows commentary on a stored snapshot. It does not edit the original source site.</p>
            </div>
          ) : (
            <>
              <div className="reviewHeader">
                <div>
                  <p className="eyebrow">{active.article.source_site}</p>
                  <h2>{active.article.title}</h2>
                  <p className="snapshot">
                    Stored {new Date(active.article.imported_at).toLocaleString()}{" "}
                    {active.article.source_revision_id ? `· revision ${active.article.source_revision_id}` : ""}
                  </p>
                </div>
                <div className="reviewStats" aria-label="Review statistics">
                  <div className={`score ${scoreTone[active.article.article_score]}`}>{active.article.article_score}</div>
                  <span><strong>{articleStats.total}</strong> flags</span>
                  <span><strong>{articleStats.approved}</strong> approved</span>
                  <span><strong>{articleStats.pending}</strong> pending</span>
                </div>
              </div>
              {active.article.article_summary ? <p className="summary">{active.article.article_summary}</p> : null}
              <p className="disclaimer">
                Stored source copy with independent reviewer commentary. The original page remains at{" "}
                <a href={active.article.source_url} target="_blank">
                  source
                </a>
                .
              </p>
              <ArticleBody
                article={active.article}
                sections={active.article.structured_content_json}
                annotations={active.annotations}
                mode={mode}
                selectionScope={selectionScope}
                onSelectionScopeChange={setSelectionScope}
                onSourceSelection={createDraftFromSourceSelection}
                onSentenceSelect={createDraftFromSentence}
                onAnnotationOpen={setOpenAnnotationId}
              />
            </>
          )}
        </article>

        <aside className="detail">
          {active && mode === "admin" ? (
            <form className="panel" onSubmit={saveScore}>
              <div className="panelTitle">
                <ListFilter size={18} />
                <h2>Article score</h2>
              </div>
              <select aria-label="Article score" value={score} onChange={(event) => setScore(event.target.value as ArticleScore)}>
                {ARTICLE_SCORES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Overall summary/comment" />
              <button type="submit">Save score</button>
            </form>
          ) : null}

          {mode === "admin" ? (
            <form className="panel" onSubmit={saveDomains}>
              <div className="panelTitle">
                <ShieldCheck size={18} />
                <h2>Allowed domains</h2>
              </div>
              <textarea value={domains} onChange={(event) => setDomains(event.target.value)} />
              <button type="submit">Save allowlist</button>
            </form>
          ) : null}

          {draft ? (
            <form className="panel annotationEditor" onSubmit={saveAnnotation}>
              <h2>New annotation</h2>
              <blockquote>{draft.selected_text}</blockquote>
              <small>
                {draft.selection_scope} selection · offsets {draft.start_offset}-{draft.end_offset}
              </small>
              <select
                aria-label="Annotation classification"
                value={draft.classification}
                onChange={(event) => setDraft({ ...draft, classification: event.target.value as AnnotationClassification })}
              >
                {ANNOTATION_CLASSIFICATIONS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select
                aria-label="Annotation score"
                value={draft.annotation_score}
                onChange={(event) => setDraft({ ...draft, annotation_score: event.target.value as ArticleScore })}
              >
                {ARTICLE_SCORES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <textarea
                required
                value={draft.comment}
                onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
                placeholder="Comment or alternative explanation"
              />
              {draft.references.map((ref, index) => (
                <div className="referenceEditor" key={index}>
                  <input
                    value={ref.url}
                    onChange={(event) => {
                      const refs = [...draft.references];
                      refs[index] = { ...refs[index], url: event.target.value };
                      setDraft({ ...draft, references: refs });
                    }}
                    placeholder="Reference URL"
                  />
                  <input
                    value={ref.title}
                    onChange={(event) => {
                      const refs = [...draft.references];
                      refs[index] = { ...refs[index], title: event.target.value };
                      setDraft({ ...draft, references: refs });
                    }}
                    placeholder="Reference title"
                  />
                  <textarea
                    value={ref.quote_or_summary}
                    onChange={(event) => {
                      const refs = [...draft.references];
                      refs[index] = { ...refs[index], quote_or_summary: event.target.value };
                      setDraft({ ...draft, references: refs });
                    }}
                    placeholder="Quote or summary"
                  />
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setDraft({
                    ...draft,
                    references: [...draft.references, { url: "", title: "", source_name: "", quote_or_summary: "" }]
                  })
                }
              >
                Add reference
              </button>
              <button disabled={busy} type="submit">
                Submit annotation
              </button>
            </form>
          ) : null}

          {openAnnotation ? (
            <div className="panel">
              <div className="panelTitle">
                <AlertTriangle size={18} />
                <h2>{openAnnotation.classification}</h2>
              </div>
              <blockquote>{openAnnotation.selected_text}</blockquote>
              <p>{openAnnotation.comment}</p>
              <div className={`score annotationScore ${scoreTone[openAnnotation.annotation_score]}`}>
                {openAnnotation.annotation_score}
              </div>
              <small>
                {openAnnotation.section_title} · {openAnnotation.selection_scope} · {openAnnotation.status}
              </small>
              <div className="refs">
                {openReferences.map((ref) => (
                  <a key={ref.id} href={ref.url} target="_blank">
                    <LinkIcon size={14} />
                    {ref.title || ref.url}
                  </a>
                ))}
              </div>
              {mode === "admin" ? (
                <div className="moderation">
                  <button onClick={() => updateAnnotation(openAnnotation.id, "approved")}>Approve</button>
                  <button className="secondary" onClick={() => updateAnnotation(openAnnotation.id, "hidden")}>
                    Hide
                  </button>
                </div>
              ) : null}
            </div>
          ) : active ? (
            <div className="panel muted">
              <Eye size={18} />
              <p>Select a highlight to view commentary.</p>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function ArticleBody({
  article,
  sections,
  annotations,
  mode,
  selectionScope,
  onSelectionScopeChange,
  onSourceSelection,
  onSentenceSelect,
  onAnnotationOpen
}: {
  article: Article;
  sections: Section[];
  annotations: Annotation[];
  mode: "visitor" | "reviewer" | "admin";
  selectionScope: SelectionScope;
  onSelectionScopeChange: (scope: SelectionScope) => void;
  onSourceSelection: (selectedText: string) => void;
  onSentenceSelect: (section: Section, paragraphIndex: number, sentenceIndex: number) => void;
  onAnnotationOpen: (id: string) => void;
}) {
  const articleHtml = useMemo(() => renderAnnotatedSourceHtml(article.raw_html, annotations), [article.raw_html, annotations]);

  function handleSourceClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const highlight = target.closest<HTMLElement>("[data-annotation-id]");
    if (highlight?.dataset.annotationId) onAnnotationOpen(highlight.dataset.annotationId);
  }

  function flagCurrentSelection() {
    onSourceSelection(window.getSelection()?.toString() ?? "");
  }

  return (
    <div className="articleBody">
      {mode !== "visitor" ? (
        <div className="reviewTools">
          <div className="selectionMode" aria-label="Selection granularity">
            {(["word", "sentence", "paragraph"] as const).map((scope) => (
              <button
                className={selectionScope === scope ? "active" : ""}
                key={scope}
                onClick={() => onSelectionScopeChange(scope)}
                type="button"
              >
                {scope}
              </button>
            ))}
          </div>
          <button className="secondary" onClick={flagCurrentSelection} type="button">
            Flag selected text
          </button>
        </div>
      ) : null}
      <div
        className={`sourceArticle source-${sourceClass(article.source_site)}`}
        onClick={handleSourceClick}
        dangerouslySetInnerHTML={{ __html: articleHtml }}
      />
      {mode !== "visitor" ? (
        <section className="reviewerSentencePicker" aria-label="Reviewer sentence picker">
          <h3>Reviewer selection picker</h3>
          {sections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraph.start_offset}>
                  {paragraph.sentences.map((sentence, sentenceIndex) => {
                    const annotation = annotations.find(
                      (item) =>
                        item.status !== "hidden" &&
                        item.start_offset <= sentence.start_offset &&
                        item.end_offset >= sentence.end_offset
                    );
                    return (
                      <span
                        className={annotation ? `sentence highlighted ${annotation.status}` : "sentence"}
                        key={sentence.start_offset}
                        onClick={() =>
                          annotation ? onAnnotationOpen(annotation.id) : onSentenceSelect(section, paragraphIndex, sentenceIndex)
                        }
                        title={annotation ? annotation.classification : "Click to annotate"}
                      >
                        {sentence.text}{" "}
                      </span>
                    );
                  })}
                </p>
              ))}
            </section>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function sourceClass(sourceSite: string) {
  if (sourceSite.includes("wikipedia")) return "wikipedia";
  if (sourceSite.includes("britannica")) return "britannica";
  return "encyclopedia";
}

function renderAnnotatedSourceHtml(rawHtml: string, annotations: Annotation[]) {
  let html = sanitizeSourceHtml(rawHtml);
  for (const annotation of annotations.filter((item) => item.status !== "hidden")) {
    const selected = annotation.selected_text.trim();
    if (!selected) continue;
    const directIndex = html.indexOf(selected);
    if (directIndex !== -1) {
      const before = html.slice(0, directIndex);
      const after = html.slice(directIndex + selected.length);
      const mark = `<mark class="sourceHighlight ${annotation.status}" data-annotation-id="${escapeHtml(annotation.id)}" title="${escapeHtml(annotation.classification)}">${escapeHtml(selected)}</mark>`;
      html = `${before}${mark}${after}`;
      continue;
    }

    const pattern = sourceTextPattern(selected);
    if (!pattern) continue;
    html = html.replace(pattern, (match) => {
      return `<mark class="sourceHighlight ${annotation.status}" data-annotation-id="${escapeHtml(annotation.id)}" title="${escapeHtml(annotation.classification)}">${match}</mark>`;
    });
  }
  return html;
}

function sourceTextPattern(selected: string) {
  const tokens = selected.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)?.slice(0, 80) ?? [];
  if (tokens.length === 0) return null;
  const flexibleSpace = "(?:\\s|&nbsp;|<[^>]+>)*";
  const pattern = tokens.map((token) => escapeRegExp(token)).join(flexibleSpace);
  return new RegExp(pattern, "i");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeSourceHtml(rawHtml: string) {
  return rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/href=(["'])javascript:[\s\S]*?\1/gi, "href=\"#\"")
    .replace(/<a\s/gi, '<a target="_blank" rel="noreferrer" ');
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
