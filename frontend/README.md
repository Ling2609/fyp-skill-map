# SkillMap frontend

React 19 + Vite + Tailwind v4. Setup, running and the full folder map are in the [root README](../README.md).

```
npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

Pages are grouped by role: `src/pages/auth/` (login, register), `src/pages/student/`, and later `src/pages/employer/` and `src/pages/admin/`. Shared pieces live in `src/components/` and `src/context/`.

Set `VITE_API_URL` in `frontend/.env` if the backend isn't on `http://localhost:8000`.
