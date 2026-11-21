# RalphGuard on Vercel and Neon

The existing Vercel project deploys Next.js at `/` and the FastAPI container at
`/backend`. NextAuth stays at `/api/auth`. The backend image retains RDKit,
scikit-learn, all required QSAR artifacts, and Tesseract. It runs assessments
within the request and stores results in Neon PostgreSQL.

## Configure the existing Vercel project

- Set Root Directory to the repository root. Let Vercel detect Services from
  the root `vercel.json`; the frontend remains in `frontend/`.
- Set `NEXT_PUBLIC_API_URL=/backend` in Preview and Production so the browser
  uses the same deployment origin.
- Set `DATABASE_URL` to the pooled Neon URL for that environment. Keep Preview
  isolated on a dedicated Neon branch.
- Keep the existing `NEXTAUTH_SECRET` and Google OAuth variables. FastAPI
  accepts the shared NextAuth secret on Vercel; an explicit `AUTH_SECRET` must
  match it. Use a registered Google callback for any preview domain where
  Google sign-in will be tested.
- Keep `GROQ_API_KEY` for the assistant and readiness check. The image defaults
  to inline execution; any existing `ASSESSMENT_EXECUTION_MODE` must be
  `inline`. If `PORT` is set explicitly, it must match the container's HTTP
  listener.

## Initialize each database before deploying

Run from the repository root. Pull only Postgres credentials to a local,
Git-ignored file. Replace `<branch>` with the intended Neon branch.

```powershell
neon env pull --project-id <project-id> --branch <branch> --services postgres --file .env.neon.local
uv run --no-project --python 3.11 --with-requirements backend/requirements.txt --with-requirements scientific/requirements.worker.txt python backend/scripts/init_neon_database.py --env-file .env.neon.local
```

The script uses `DATABASE_URL_UNPOOLED` to run Alembic and seed the herbal
catalogue. Both operations are kept out of container startup. Production
changes should be tested against a separate Neon branch before cutover.

## Verify and release

On the Preview URL verify `/backend/health/ready`, NextAuth session routing,
an authenticated assessment with a completed result, and a real label scan.
Vercel uploads are capped at 4 MB per image by the frontend to leave room for
multipart overhead. Stage Production with its own environment and verify
before promoting the deployment to the existing domain.
