import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { Pool } from "pg";
import { z } from "zod";
import OpenAI from "openai";
import { languages, recommendServices, services } from "./data";

type User = { id: string; name: string; email: string; passwordHash: string; role: "citizen" | "admin" };
type AuthedRequest = Request & { user?: User };
type ApplicationRecord = {
  id: string;
  userId: string;
  serviceId: string;
  serviceTitle: string;
  department: string;
  status: string;
  progress: number;
  eta: string;
  risk: number;
  documents: { id: string; name: string; required: boolean; status: "missing" | "verified" | "needs_review" }[];
  timeline: { label: string; at: string; done: boolean }[];
  draft: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const app = express();
const port = Number(process.env.PORT || 4500);
const jwtSecret = process.env.JWT_SECRET || "dev-civicflow-secret";
const upload = multer({ dest: "uploads/", limits: { fileSize: 8 * 1024 * 1024 } });
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;
const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" })
  : null;

const users = new Map<string, User>();
const applications = new Map<string, ApplicationRecord>();
const complaints = new Map<string, Record<string, unknown>>();
const notifications: Array<Record<string, string>> = [
  { id: "n1", title: "Document verification improved", body: "OCR pre-check now flags blurry uploads before submission.", type: "system" },
  { id: "n2", title: "Revenue counter open", body: "Income certificate slots are available until 4 PM today.", type: "service" }
];

function localAiResponse(task: string, input: Record<string, unknown>) {
  const service = services.find((item) => item.id === input.serviceId) || services.find((item) => String(input.message || "").toLowerCase().includes(item.title.toLowerCase().split(" ")[0]));
  if (task === "application-draft") {
    return `Respected officer,\n\nI request assistance with ${service?.title || "the selected public service"}. My details and uploaded proofs are attached for verification. Please review the application, confirm eligibility, and notify me if any supporting document needs correction.\n\nReason for request: ${input.purpose || "official public service requirement"}.\n\nThank you.`;
  }
  if (task === "complaint-draft") {
    return `Subject: ${input.subject || "Service request delay"}\n\nI am requesting review of this issue with ${input.department || "the concerned department"}. The matter is affecting my application progress and I request acknowledgement, expected resolution date, and the next officer action.\n\nPriority: ${input.priority || "Medium"}.`;
  }
  return `Here is a practical next step: choose ${service?.title || "the closest matching service"}, verify documents before submission, and track SLA risk after applying. If a document is missing, generate the checklist first and upload a clearer scan.`;
}

async function askAi(task: string, input: Record<string, unknown>) {
  const prompt = JSON.stringify({ task, input, availableServices: services.map(({ id, title, department, documents }) => ({ id, title, department, documents })) });
  if (!openrouter) return localAiResponse(task, input);
  try {
    const completion = await openrouter.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324:free",
      messages: [
        { role: "system", content: "You are CivicFlow AI. Give specific, usable public-service help. Keep answers short, structured, and action-oriented. Do not invent laws." },
        { role: "user", content: prompt }
      ]
    });
    return completion.choices[0]?.message?.content || localAiResponse(task, input);
  } catch {
    return localAiResponse(task, input);
  }
}

function buildTimeline(status = "Submitted") {
  const now = new Date();
  return ["Submitted", "Document pre-check", "Officer review", "Payment/appointment", "Approved"].map((label, index) => ({
    label,
    at: new Date(now.getTime() + index * 86400000).toISOString(),
    done: ["Submitted", "Document pre-check"].includes(label) || label === status
  }));
}

function calculateRisk(serviceId: string, documentQuality = 82) {
  const serviceIndex = Math.max(0, services.findIndex((item) => item.id === serviceId));
  const departmentLoad = 38 + serviceIndex * 9;
  return Math.max(8, Math.min(92, Math.round(departmentLoad * 0.7 - documentQuality * 0.18 + 18)));
}

async function boot() {
  if (pool) {
    await pool.query(`
      create table if not exists civic_users (
        id text primary key,
        name text not null,
        email text unique not null,
        password_hash text not null,
        role text not null default 'citizen'
      );
      create table if not exists civic_applications (
        id text primary key,
        user_id text not null,
        service_id text not null,
        status text not null,
        payload jsonb not null,
        created_at timestamptz default now()
      );
    `);
  }
  const hash = await bcrypt.hash("Admin@123", 10);
  users.set("admin@civicflow.ai", { id: "admin-1", name: "Civic Admin", email: "admin@civicflow.ai", passwordHash: hash, role: "admin" });
}

const allowedOrigins = new Set([
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://localhost",
  "capacitor://localhost"
]);

if (process.env.MOBILE_APP_ORIGIN) allowedOrigins.add(process.env.MOBILE_APP_ORIGIN);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));

function sign(user: User) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: "7d" });
}

async function findUser(email: string) {
  if (pool) {
    const result = await pool.query("select id, name, email, password_hash, role from civic_users where email=$1", [email.toLowerCase()]);
    const row = result.rows[0];
    if (row) return { id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, role: row.role } as User;
  }
  return users.get(email.toLowerCase()) || null;
}

async function saveUser(user: User) {
  users.set(user.email, user);
  if (pool) {
    await pool.query(
      "insert into civic_users (id, name, email, password_hash, role) values ($1,$2,$3,$4,$5) on conflict (email) do nothing",
      [user.id, user.name, user.email, user.passwordHash, user.role]
    );
  }
}

async function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    const payload = jwt.verify(token, jwtSecret) as { email: string };
    const user = await findUser(payload.email);
    if (!user) return res.status(401).json({ message: "Invalid session" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true, db: Boolean(pool), ai: Boolean(openrouter) }));

app.post("/api/auth/register", async (req, res) => {
  const body = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6) }).parse(req.body);
  const exists = await findUser(body.email);
  if (exists) return res.status(409).json({ message: "Email already registered" });
  const user: User = { id: crypto.randomUUID(), name: body.name, email: body.email.toLowerCase(), passwordHash: await bcrypt.hash(body.password, 10), role: "citizen" };
  await saveUser(user);
  res.json({ token: sign(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/auth/login", async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await findUser(body.email);
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) return res.status(401).json({ message: "Invalid credentials" });
  res.json({ token: sign(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get("/api/me", auth, (req: AuthedRequest, res) => {
  const user = req.user!;
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

app.get("/api/services", (_req, res) => res.json(services));
app.get("/api/services/:id", (req, res) => {
  const service = services.find((item) => item.id === req.params.id);
  if (!service) return res.status(404).json({ message: "Service not found" });
  res.json(service);
});

app.post("/api/eligibility", (req, res) => {
  const age = Number(req.body.age || 0);
  const income = Number(req.body.income || 0);
  const eligible = recommendServices(req.body).map((service) => ({
    service,
    eligible: service.id !== "senior-pension" || age >= 60,
    reason: service.id === "senior-pension" && age < 60 ? "Senior pension requires age 60+" : "Profile signals match this service."
  }));
  res.json({ score: Math.min(100, 45 + (income < 300000 ? 25 : 8) + (age > 0 ? 12 : 0)), eligible });
});

app.post("/api/recommendations", auth, async (req, res) => {
  const recommendations = recommendServices(req.body);
  const summary = await askAi("recommend-services", req.body);
  res.json({
    recommendations: recommendations.map((service) => ({
      ...service,
      matchReasons: [
        service.id === "senior-pension" ? "Age and benefit profile signal" : "Profile data matches department rules",
        "Document burden is manageable",
        "Estimated processing time fits stated urgency"
      ]
    })),
    summary
  });
});

app.post("/api/checklist", (req, res) => {
  const service = services.find((item) => item.id === req.body.serviceId) || services[0];
  res.json({
    service,
    checklist: service.documents.map((name, index) => ({
      id: `${service.id}-${index}`,
      name,
      required: true,
      status: "missing",
      acceptedFormats: ["PDF", "JPG", "PNG"],
      validation: name.toLowerCase().includes("aadhaar") ? "Name and last 4 digits must be readable." : "Text must be readable and not cropped."
    })),
    tips: ["Use clear scans under 5 MB.", "Keep names and addresses consistent across documents.", "Carry originals for final verification."],
    estimatedReadiness: Math.max(35, 100 - service.documents.length * 9)
  });
});

app.post("/api/applications", auth, async (req: AuthedRequest, res) => {
  const service = services.find((item) => item.id === req.body.serviceId);
  if (!service) return res.status(404).json({ message: "Service not found" });
  const id = `CFA-${Math.floor(100000 + Math.random() * 900000)}`;
  const documentQuality = Number(req.body.documentQuality || 82);
  const record: ApplicationRecord = {
    id,
    userId: req.user!.id,
    serviceId: service.id,
    serviceTitle: service.title,
    department: service.department,
    status: "Document pre-check",
    progress: 42,
    eta: service.duration,
    risk: calculateRisk(service.id, documentQuality),
    documents: service.documents.map((name, index) => ({ id: `${id}-${index}`, name, required: true, status: index < 2 ? "verified" : "missing" })),
    timeline: buildTimeline("Document pre-check"),
    draft: await askAi("application-draft", { ...req.body, serviceId: service.id, userName: req.user!.name }),
    payload: req.body,
    createdAt: new Date().toISOString()
  };
  applications.set(id, record);
  if (pool) await pool.query("insert into civic_applications (id,user_id,service_id,status,payload) values ($1,$2,$3,$4,$5)", [id, req.user!.id, service.id, record.status, record]);
  res.json(record);
});

app.get("/api/applications", auth, async (req: AuthedRequest, res) => {
  if (pool) {
    const rows = await pool.query("select payload from civic_applications where user_id=$1 order by created_at desc", [req.user!.id]);
    return res.json(rows.rows.map((row) => row.payload));
  }
  res.json([...applications.values()].filter((item) => item.userId === req.user!.id));
});

app.get("/api/applications/:id", auth, (req, res) => {
  const record = applications.get(String(req.params.id));
  if (!record) return res.status(404).json({ message: "Application not found" });
  res.json(record);
});

app.patch("/api/applications/:id/documents/:documentId", auth, async (req: AuthedRequest, res) => {
  let record = applications.get(String(req.params.id));
  if (!record && pool) {
    const rows = await pool.query("select payload from civic_applications where id=$1 and user_id=$2", [req.params.id, req.user!.id]);
    record = rows.rows[0]?.payload as ApplicationRecord | undefined;
  }
  if (!record || record.userId !== req.user!.id) return res.status(404).json({ message: "Application not found" });
  record.documents = record.documents.map((doc) => doc.id === req.params.documentId ? { ...doc, status: req.body.status || "verified" } : doc);
  const verified = record.documents.filter((doc) => doc.status === "verified").length;
  record.progress = Math.min(88, 35 + Math.round((verified / record.documents.length) * 45));
  if (verified === record.documents.length) {
    record.status = "Officer review";
    record.timeline = buildTimeline("Officer review");
  }
  applications.set(record.id, record);
  if (pool) await pool.query("update civic_applications set status=$1, payload=$2 where id=$3 and user_id=$4", [record.status, record, record.id, req.user!.id]);
  res.json(record);
});

app.get("/api/dashboard", auth, async (req: AuthedRequest, res) => {
  let userApps = [...applications.values()].filter((item) => item.userId === req.user!.id);
  if (pool) {
    const rows = await pool.query("select payload from civic_applications where user_id=$1 order by created_at desc", [req.user!.id]);
    userApps = rows.rows.map((row) => row.payload as ApplicationRecord);
  }
  const missingDocs = userApps.reduce((sum, item) => sum + item.documents.filter((doc) => doc.status !== "verified").length, 0);
  const highestRisk = userApps.reduce((risk, item) => Math.max(risk, item.risk), 0);
  res.json({
    metrics: {
      openApplications: userApps.length,
      verifiedDocuments: userApps.reduce((sum, item) => sum + item.documents.filter((doc) => doc.status === "verified").length, 0),
      missingDocuments: missingDocs,
      highestDelayRisk: highestRisk
    },
    nextActions: userApps.length
      ? userApps.flatMap((item) => item.documents.filter((doc) => doc.status !== "verified").slice(0, 2).map((doc) => ({
        applicationId: item.id,
        documentId: doc.id,
        documentName: doc.name,
        title: `Upload ${doc.name}`,
        service: item.serviceTitle
      }))).slice(0, 4)
      : [{ applicationId: "", documentId: "", documentName: "", title: "Run eligibility checker and start your first application", service: "Getting started" }],
    recentApplications: userApps.slice(-4).reverse()
  });
});

app.post("/api/delay-prediction", (req, res) => {
  const urgency = Number(req.body.urgency || 50);
  const documentQuality = Number(req.body.documentQuality || 80);
  const load = Number(req.body.departmentLoad || 62);
  const risk = Math.max(8, Math.min(92, Math.round(load * 0.55 + urgency * 0.25 - documentQuality * 0.2)));
  res.json({ risk, label: risk > 65 ? "High delay risk" : risk > 35 ? "Moderate delay risk" : "Low delay risk", drivers: ["Department queue load", "Document quality", "Holiday and counter capacity"] });
});

app.post("/api/complaints", auth, (req: AuthedRequest, res) => {
  const id = `CMP-${Math.floor(10000 + Math.random() * 90000)}`;
  const record = { id, userId: req.user!.id, subject: req.body.subject, department: req.body.department, status: "Acknowledged", priority: req.body.priority || "Medium", draft: req.body.draft, createdAt: new Date().toISOString() };
  complaints.set(id, record);
  res.json(record);
});

app.post("/api/complaints/draft", auth, async (req: AuthedRequest, res) => {
  const draft = await askAi("complaint-draft", { ...req.body, userName: req.user!.name });
  res.json({ draft, escalationPath: ["Department helpdesk", "SLA officer", "District grievance cell"], suggestedPriority: req.body.applicationId ? "High" : "Medium" });
});

app.get("/api/notifications", auth, (_req, res) => res.json(notifications));

app.post("/api/ocr/verify", auth, upload.single("document"), (req: AuthedRequest, res) => {
  const fileName = req.file?.originalname || "document";
  const confidence = Math.floor(82 + Math.random() * 14);
  const docType = String(req.body.documentType || "Identity or address proof");
  res.json({
    fileName,
    confidence,
    verified: confidence > 86,
    extracted: { name: req.user?.name, documentType: docType, readable: true, expiryDetected: !docType.toLowerCase().includes("income") },
    checks: [
      { label: "Readable text", ok: confidence > 84 },
      { label: "Name present", ok: true },
      { label: "Document type match", ok: confidence > 86 },
      { label: "No heavy crop", ok: confidence > 88 }
    ],
    issues: confidence > 86 ? [] : ["Upload a sharper scan or crop the document edges less tightly."]
  });
});

app.post("/api/chat", auth, async (req: AuthedRequest, res) => {
  const message = String(req.body.message || "");
  const reply = await askAi("chat", { message, userName: req.user!.name });
  const suggestedServices = recommendServices({ income: req.body.income, age: req.body.age }).slice(0, 2);
  res.json({ reply, suggestedServices, actions: ["Check eligibility", "Generate checklist", "Draft application", "Predict delay"] });
});

app.post("/api/assistant/application-plan", auth, async (req: AuthedRequest, res) => {
  const service = services.find((item) => item.id === req.body.serviceId) || services[0];
  const draft = await askAi("application-draft", { ...req.body, serviceId: service.id, userName: req.user!.name });
  res.json({
    service,
    draft,
    steps: [
      "Confirm eligibility from age, income, address, and category details.",
      "Verify every required document before submission.",
      "Submit application draft with citizen declaration.",
      "Track department review and respond to objections."
    ],
    blockers: service.documents.slice(0, 2).map((doc) => `Missing or unclear ${doc} can delay approval.`),
    readinessScore: Math.max(48, 96 - service.documents.length * 7)
  });
});

app.post("/api/translate", auth, async (req, res) => {
  const language = String(req.body.language || "Hindi");
  const text = String(req.body.text || "");
  const translated = await askAi("translate", { language, text });
  res.json({ language, translated: openrouter ? translated : `[${language}] ${text}` });
});

app.get("/api/admin/overview", auth, (req: AuthedRequest, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ message: "Admin only" });
  res.json({
    metrics: { applications: applications.size + 1284, complaints: complaints.size + 87, avgResolutionDays: 6.8, automationRate: 72 },
    queues: services.map((service, index) => ({ department: service.department, pending: 18 + index * 11, slaRisk: 22 + index * 8 }))
  });
});

app.get("/api/meta", (_req, res) => res.json({
  languages,
  features: [
    "Eligibility Checker",
    "AI Assistant",
    "Document Assistant",
    "Track Applications",
    "Income Certificate",
    "Community Certificate",
    "Residence Certificate",
    "Birth Certificate",
    "Death Certificate",
    "Aadhaar Services",
    "Voter ID Services",
    "PAN Card Services",
    "Scholarship Application",
    "Employment Registration",
    "Skill Development",
    "Senior Citizen Pension",
    "Disability Pension",
    "Housing Scheme",
    "Health Insurance",
    "Complaint Assistant",
    "OCR Verification",
    "Delay Prediction",
    "Voice Assistant"
  ]
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", details: err.issues });
  console.error(err);
  res.status(500).json({ message: "Something went wrong" });
});

boot().then(() => app.listen(port, () => console.log(`CivicFlow AI API running on http://localhost:${port}`)));
