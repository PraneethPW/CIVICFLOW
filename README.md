# CivicFlow AI

AI-powered public service application assistant built with:

- Frontend: React, TypeScript, Vite, Tailwind CSS, Three.js, Framer Motion
- Backend: Node.js, Express, TypeScript
- Database: Neon Postgres through `DATABASE_URL`
- AI: OpenRouter API through `OPENROUTER_API_KEY`

## Folder Structure

```txt
civicflow-ai/
  frontend/   React app, landing page, dashboards, AI tools
  backend/    Express API, auth, service workflows, AI/OCR routes
```

## Run Locally

Backend:

```bash
cd backend
copy .env.example .env
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

The app runs at `http://localhost:5173` and the API runs at `http://localhost:4500`.

## Demo Admin

```txt
Email: admin@civicflow.ai
Password: Admin@123
```

## Implemented Workflows

- Authentication with JWT
- Citizen dashboard
- Eligibility checker
- Service directory
- AI recommendations and chatbot route
- Document checklist generator
- Application submission and tracking
- Complaint assistant
- Notifications
- OCR upload verification route
- Delay prediction route
- Multilingual and voice-ready UI sections
- Admin panel with queue metrics

The backend uses Neon Postgres when `DATABASE_URL` is configured. Without it, development still works with an in-memory fallback.
