# ClaimLens

Human-led fact-check annotation for encyclopedia article snapshots.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000.

## MVP Scope

- Admin imports Wikipedia and Britannica URLs.
- The app stores raw HTML, cleaned text, structured sections, source metadata, and revision ID.
- Reviewers select stored sentences/paragraphs and add classifications, comments, and references.
- Admins approve/hide annotations and assign an overall article score.
- Visitors search or paste a URL to view the stored snapshot with highlighted commentary.

Data is persisted in PostgreSQL. A Docker Compose file is included for local development.

## Authentication and Roles

Authentication is handled by Clerk. Set these values in `.env` from the Clerk dashboard:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

Roles are read from Clerk user `publicMetadata.role`:

- `visitor`: search and read stored article snapshots.
- `reviewer`: visitor access plus create word/sentence/paragraph annotations.
- `admin`: reviewer access plus import articles, approve/hide annotations, update article scores, and manage allowed source domains.

Clerk setup checklist:

1. Create a Clerk application from the Clerk dashboard.
2. Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into `.env`.
3. In Clerk Dashboard > Users, open each user and set `publicMetadata` to one of:

```json
{ "role": "admin" }
```

```json
{ "role": "reviewer" }
```

```json
{ "role": "visitor" }
```

4. In Clerk Dashboard > Configure > Paths, use `/sign-in` and `/sign-up` for sign-in/sign-up URLs.
5. Add your deployment domain and local development URL, such as `http://localhost:3000`, to the allowed origins if Clerk prompts for it.

For local automated tests only, `E2E_ALLOW_RESET=1` enables guarded `x-test-role` headers and `NEXT_PUBLIC_E2E_AUTH_ROLE=admin` skips Clerk's browser script.

## Database

```bash
cp .env.example .env
npm run db:up
npm run db:reset
```

The default connection string is:

```text
postgres://factcheck:factcheck@localhost:5432/factcheck
```

## Tests

```bash
npm run test:unit
npm run test:e2e
npm run test:all
```

The e2e suite runs the full MVP flow in desktop Chromium and a mobile viewport:

- reset the test database
- import a Wikipedia article
- create a reviewer annotation with an external reference
- approve the annotation
- assign an article score
- search as a visitor and open highlighted commentary
- verify role-based API restrictions
