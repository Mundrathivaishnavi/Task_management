# Team Task Manager

A full-stack team task manager where admins create projects, assign tasks, and track progress with role-based access (Admin/Member).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/task-manager run dev` — run the frontend (port 18810)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `MONGODB_URI` — MongoDB Atlas connection string, `SESSION_SECRET` — JWT signing secret

## Demo Accounts

- Create fresh accounts via `/signup` — MongoDB Atlas is a clean slate; sign up with any email/password.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + shadcn/ui + Tailwind CSS + wouter
- API: Express 5 + JWT authentication (jsonwebtoken + bcryptjs)
- DB: **MongoDB Atlas + Mongoose** (replaced PostgreSQL + Drizzle ORM)
- Validation: Zod (`zod/v4`)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth; IDs are `string` type for MongoDB ObjectIds)
- `lib/db/src/index.ts` — Mongoose models (User, Project, Task) + `connectDB()`
- `artifacts/api-server/src/routes/` — Express route handlers (auth, users, projects, tasks, dashboard)
- `artifacts/api-server/src/middlewares/auth.ts` — JWT middleware
- `artifacts/api-server/src/lib/jwt.ts` — Token signing/verification (userId is string)
- `artifacts/task-manager/src/` — React frontend
- `lib/api-client-react/src/generated/` — Auto-generated React Query hooks
- `lib/api-zod/src/generated/` — Auto-generated Zod schemas for server validation

## Architecture decisions

- JWT stored in localStorage, injected into all API requests via `custom-fetch.ts`
- Role-based access: admins can create/edit/delete everything; members can only view their projects and update task status
- OpenAPI-first: spec defines the contract, codegen produces typed hooks and Zod schemas
- **MongoDB Atlas** with Mongoose for document-based storage
- All IDs are MongoDB ObjectId strings (not integers)
- Project members stored as `memberIds` array embedded in the Project document
- All API routes mount under `/api`

## Product

- Auth: Signup with role selection (Admin/Member), Login with JWT
- Dashboard: Stats overview (total/completed/pending/overdue tasks, projects, members) + recent tasks feed
- Projects: List view with member/task counts, create (admin), detail view with members and tasks
- Tasks: Filterable list by status and project, create (admin), detail with status update for members
- Role-based UI: Admins see create/edit/delete controls; Members see only their assigned work

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After OpenAPI spec changes, re-run codegen: `pnpm --filter @workspace/api-spec run codegen`
- IDs are MongoDB ObjectId strings — never pass integers to route params
- `connectDB()` is called at server startup in `artifacts/api-server/src/index.ts`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
