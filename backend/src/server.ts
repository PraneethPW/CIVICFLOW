import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { Store } from "./store";
import { Realtime } from "./realtime";
import { recognize, fileType } from "./ocr";
import { z } from "zod";
import OpenAI from "openai";
import { languages, recommendServices, services } from "./data";

type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "citizen" | "admin";
};
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
  documents: {
    fileId?: string;
    fileName?: string;
    ocrConfidence?: number;
    id: string;
    name: string;
    required: boolean;
    status: "missing" | "verified" | "needs_review";
  }[];
  timeline: { label: string; at: string; done: boolean }[];
  draft: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
  version?: number;
};

const app = express();
const port = Number(process.env.PORT || 4500);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32)
  throw new Error(
    "Set JWT_SECRET to at least 32 random characters in backend/.env (npm run setup).",
  );
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5 },
});
const store = new Store();
const realtime = new Realtime(store.pool);
const uploadDir = resolve(process.env.UPLOAD_DIR || "data/uploads");
type Complaint = {
  id: string;
  userId: string;
  subject: string;
  department: string;
  applicationId?: string;
  priority: string;
  status: string;
  draft: string;
  createdAt: string;
  updatedAt: string;
  response?: string;
  version: number;
};
type Note = {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  createdAt: string;
  readAt?: string;
};
type FileRecord = {
  id: string;
  userId: string;
  applicationId: string;
  name: string;
  type: string;
};
const statuses = [
  "Document pre-check",
  "Officer review",
  "Payment/appointment",
  "Approved",
  "Rejected",
] as const;
// Serialize mutations in one process; compare versions atomically in Postgres below.
const locks = new Map<string, Promise<unknown>>();
async function locked<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) || Promise.resolve();
  const pending = previous.catch(() => {}).then(action);
  locks.set(id, pending);
  try {
    return await pending;
  } finally {
    if (locks.get(id) === pending) locks.delete(id);
  }
}
async function saveApplication(record: ApplicationRecord, expected: number) {
  record.version = expected + 1;
  record.updatedAt = new Date().toISOString();
  if (store.pool) {
    const result = await store.pool.query(
      `UPDATE civic_records SET record=$1 WHERE kind='application' AND id=$2 AND COALESCE((record->>'version')::int,0)=$3`,
      [record, record.id, expected],
    );
    if (!result.rowCount)
      throw Object.assign(
        new Error("Application changed. Refresh and try again."),
        { status: 409 },
      );
  } else await store.put("application", record);
}
async function notify(
  userId: string,
  title: string,
  body: string,
  topic: string,
) {
  await store.put<Note>("notification", {
    id: randomUUID(),
    userId,
    title,
    body,
    type: topic,
    createdAt: new Date().toISOString(),
  });
  await realtime.publish(userId, topic);
}
async function ownedApplication(req: AuthedRequest) {
  const record = await store.get<ApplicationRecord>(
    "application",
    String(req.params.id),
  );
  if (!record || (record.userId !== req.user!.id && req.user!.role !== "admin"))
    throw Object.assign(new Error("Application not found"), { status: 404 });
  return record;
}
function admin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user!.role !== "admin")
    return res.status(403).json({ message: "Admin only" });
  next();
}
function newest<T extends { createdAt: string }>(items: T[]) {
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      timeout: 45000,
      maxRetries: 1,
    })
  : null;

function localAiResponse(task: string, input: Record<string, unknown>) {
  const service =
    services.find((item) => item.id === input.serviceId) ||
    services.find((item) =>
      String(input.message || "")
        .toLowerCase()
        .includes(item.title.toLowerCase().split(" ")[0]),
    );
  if (task === "application-draft") {
    return `Respected officer,\n\nI request assistance with ${service?.title || "the selected public service"}. My details and uploaded proofs are attached for verification. Please review the application, confirm eligibility, and notify me if any supporting document needs correction.\n\nReason for request: ${input.purpose || "official public service requirement"}.\n\nThank you.`;
  }
  if (task === "complaint-draft") {
    return `Subject: ${input.subject || "Service request delay"}\n\nI am requesting review of this issue with ${input.department || "the concerned department"}. The matter is affecting my application progress and I request acknowledgement, expected resolution date, and the next officer action.\n\nPriority: ${input.priority || "Medium"}.`;
  }
  return `Here is a practical next step: choose ${service?.title || "the closest matching service"}, verify documents before submission, and track SLA risk after applying. If a document is missing, generate the checklist first and upload a clearer scan.`;
}

async function askAi(task: string, input: Record<string, unknown>) {
  const prompt = JSON.stringify({
    task,
    input,
    availableServices: services.map(({ id, title, department, documents }) => ({
      id,
      title,
      department,
      documents,
    })),
  });
  if (!openrouter) return localAiResponse(task, input);
  try {
    const completion = await openrouter.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "You are CivicFlow AI. Give specific, usable public-service help. Keep answers short, structured, and action-oriented. Do not invent laws.",
        },
        { role: "user", content: prompt },
      ],
    });
    return (
      completion.choices[0]?.message?.content || localAiResponse(task, input)
    );
  } catch {
    if (task === "translate")
      throw Object.assign(
        new Error("Translation provider unavailable. Try again later."),
        { status: 503 },
      );
    return localAiResponse(task, input);
  }
}

function buildTimeline(
  status = "Document pre-check",
  previous: ApplicationRecord["timeline"] = [],
) {
  const stages = [
    "Submitted",
    "Document pre-check",
    "Officer review",
    "Payment/appointment",
    "Approved",
  ];
  const current = stages.indexOf(status);
  return stages.map((label, index) => {
    const old = previous.find((item) => item.label === label);
    const done = status === "Rejected" ? !!old?.done : index <= current;
    return { label, at: done ? old?.at || new Date().toISOString() : "", done };
  });
}

function calculateRisk(serviceId: string, documentQuality = 82) {
  const serviceIndex = Math.max(
    0,
    services.findIndex((item) => item.id === serviceId),
  );
  const departmentLoad = 38 + serviceIndex * 9;
  return Math.max(
    8,
    Math.min(
      92,
      Math.round(departmentLoad * 0.7 - documentQuality * 0.18 + 18),
    ),
  );
}

async function boot() {
  await store.init();
  await mkdir(uploadDir, { recursive: true });
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = z.email().parse(process.env.ADMIN_EMAIL.toLowerCase());
    if (!(await findUser(email))) {
      const password = z.string().min(12).parse(process.env.ADMIN_PASSWORD);
      await store.put<User>("user", {
        id: randomUUID(),
        email,
        name: "Civic Admin",
        role: "admin",
        passwordHash: await bcrypt.hash(password, 12),
      });
    }
  }
  await realtime.init();
}

const allowedOrigins = new Set([
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
]);

for (const origin of (process.env.CORS_ORIGINS || "")
  .split(",")
  .filter(Boolean))
  allowedOrigins.add(origin.trim());

if (process.env.MOBILE_APP_ORIGIN)
  allowedOrigins.add(process.env.MOBILE_APP_ORIGIN);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

function sign(user: User) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret!, {
    expiresIn: "7d",
  });
}

async function findUser(email: string) {
  const normalized = email.trim().toLowerCase();
  if (store.pool)
    return (
      await store.pool.query(
        "SELECT record FROM civic_records WHERE kind='user' AND lower(record->>'email')=$1",
        [normalized],
      )
    ).rows[0]?.record as User | undefined;
  return (await store.list<User>("user")).find(
    (user) => user.email === normalized,
  );
}
async function saveUser(user: User) {
  await store.put("user", user);
}

async function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    const payload = jwt.verify(token, jwtSecret!) as { email: string };
    const user = await findUser(payload.email);
    if (!user) return res.status(401).json({ message: "Invalid session" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    storage: store.pool ? "postgres" : "sqlite",
    ai: Boolean(openrouter),
    realtime: true,
  }),
);
app.get("/api/events", auth, (req: AuthedRequest, res) =>
  realtime.subscribe(req.user!.id, req.user!.role === "admin", res),
);
const authAttempts = new Map<string, { count: number; reset: number }>();
app.use("/api/auth", (req, res, next) => {
  const key = req.ip || "unknown";
  const now = Date.now();
  for (const [id, attempt] of authAttempts)
    if (attempt.reset < now) authAttempts.delete(id);
  const attempt = authAttempts.get(key) || { count: 0, reset: now + 60000 };
  if (++attempt.count > 20)
    return res
      .status(429)
      .json({ message: "Too many attempts. Try again in a minute." });
  authAttempts.set(key, attempt);
  next();
});

app.post("/api/auth/register", async (req, res) => {
  const body = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8).max(128),
    })
    .parse(req.body);
  const exists = await findUser(body.email);
  if (exists)
    return res.status(409).json({ message: "Email already registered" });
  const user: User = {
    id: randomUUID(),
    name: body.name,
    email: body.email.toLowerCase(),
    passwordHash: await bcrypt.hash(body.password, 10),
    role: "citizen",
  };
  await saveUser(user);
  res.json({
    token: sign(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.post("/api/auth/login", async (req, res) => {
  const body = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .parse(req.body);
  const user = await findUser(body.email);
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash)))
    return res.status(401).json({ message: "Invalid credentials" });
  res.json({
    token: sign(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.get("/api/me", auth, (req: AuthedRequest, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
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
    reason:
      service.id === "senior-pension" && age < 60
        ? "Senior pension requires age 60+"
        : "Profile signals match this service.",
  }));
  res.json({
    score: Math.min(100, 45 + (income < 300000 ? 25 : 8) + (age > 0 ? 12 : 0)),
    eligible,
  });
});

app.post("/api/recommendations", auth, async (req, res) => {
  const recommendations = recommendServices(req.body);
  const summary = await askAi("recommend-services", req.body);
  res.json({
    recommendations: recommendations.map((service) => ({
      ...service,
      matchReasons: [
        service.id === "senior-pension"
          ? "Age and benefit profile signal"
          : "Profile data matches department rules",
        "Document burden is manageable",
        "Estimated processing time fits stated urgency",
      ],
    })),
    summary,
  });
});

app.post("/api/checklist", (req, res) => {
  const service =
    services.find((item) => item.id === req.body.serviceId) || services[0];
  res.json({
    service,
    checklist: service.documents.map((name, index) => ({
      id: `${service.id}-${index}`,
      name,
      required: true,
      status: "missing",
      acceptedFormats: ["PDF", "JPG", "PNG"],
      validation: name.toLowerCase().includes("aadhaar")
        ? "Name and last 4 digits must be readable."
        : "Text must be readable and not cropped.",
    })),
    tips: [
      "Use clear scans under 5 MB.",
      "Keep names and addresses consistent across documents.",
      "Carry originals for final verification.",
    ],
    estimatedReadiness: Math.max(35, 100 - service.documents.length * 9),
  });
});

app.post("/api/applications", auth, async (req: AuthedRequest, res) => {
  const body = z
    .object({ serviceId: z.string(), purpose: z.string().max(2000).optional() })
    .parse(req.body);
  const service = services.find((item) => item.id === body.serviceId);
  if (!service) return res.status(404).json({ message: "Service not found" });
  const id = `CFA-${randomUUID()}`;
  const documentQuality = 0;
  const record: ApplicationRecord = {
    id,
    userId: req.user!.id,
    serviceId: service.id,
    serviceTitle: service.title,
    department: service.department,
    status: "Document pre-check",
    progress: 20,
    eta: service.duration,
    risk: calculateRisk(service.id, documentQuality),
    documents: service.documents.map((name, index) => ({
      id: `${id}-${index}`,
      name,
      required: true,
      status: "missing",
    })),
    timeline: buildTimeline("Document pre-check"),
    draft: await askAi("application-draft", {
      ...req.body,
      serviceId: service.id,
      userName: req.user!.name,
    }),
    payload: body,
    createdAt: new Date().toISOString(),
    version: 0,
  };
  await store.put("application", record);
  await notify(
    record.userId,
    "Application created",
    `${service.title} is awaiting documents.`,
    "applications",
  );
  res.json(record);
});

app.get("/api/applications", auth, async (req: AuthedRequest, res) => {
  res.json(
    newest(await store.list<ApplicationRecord>("application", req.user!.id)),
  );
});
app.get("/api/applications/:id", auth, async (req: AuthedRequest, res) =>
  res.json(await ownedApplication(req)),
);

app.post(
  "/api/applications/:id/documents/:documentId/upload",
  auth,
  upload.single("document"),
  async (req: AuthedRequest, res) => {
    await locked(String(req.params.id), async () => {
      const record = await ownedApplication(req);
      if (["Approved", "Rejected"].includes(record.status))
        return res.status(409).json({ message: "This application is closed." });
      const doc = record.documents.find(
        (item) => item.id === req.params.documentId,
      );
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (!req.file)
        return res.status(400).json({ message: "Choose a document to upload" });
      const type = fileType(req.file.buffer);
      const expected = record.version || 0;
      const result = await recognize(req.file.buffer, doc.name).catch(() => ({
        confidence: 0,
        verified: false,
        issues: ["OCR unavailable. File saved for manual officer review."],
        checks: [{ label: "Officer review required", ok: false }],
        extracted: { documentType: doc.name, readable: false },
      }));
      const fileId = randomUUID();
      await writeFile(resolve(uploadDir, fileId), req.file.buffer, {
        mode: 0o600,
      });
      try {
        await store.put<FileRecord>("file", {
          id: fileId,
          userId: record.userId,
          applicationId: record.id,
          name: req.file.originalname.slice(0, 180),
          type,
        });
        doc.fileId = fileId;
        doc.fileName = req.file.originalname.slice(0, 180);
        doc.ocrConfidence = result.confidence;
        doc.status = "needs_review";
        record.status = "Document pre-check";
        record.progress = 20;
        record.timeline = buildTimeline(record.status);
        await saveApplication(record, expected);
      } catch (error) {
        await rm(resolve(uploadDir, fileId), { force: true });
        throw error;
      }
      await notify(
        record.userId,
        "Document uploaded",
        `${doc.name} is awaiting officer review.`,
        "applications",
      );
      res.json({ application: record, ocr: result });
    });
  },
);
app.get("/api/files/:fileId", auth, async (req: AuthedRequest, res) => {
  const file = await store.get<FileRecord>("file", String(req.params.fileId));
  if (!file || (file.userId !== req.user!.id && req.user!.role !== "admin"))
    return res.status(404).json({ message: "File not found" });
  res.set({
    "Content-Type": file.type,
    "Content-Disposition": "attachment; filename=document",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.send(await readFile(resolve(uploadDir, file.id)));
});
app.patch(
  "/api/applications/:id/documents/:documentId",
  auth,
  admin,
  async (req: AuthedRequest, res) => {
    await locked(String(req.params.id), async () => {
      const record = await ownedApplication(req);
      const expected = record.version || 0;
      const body = z
        .object({
          status: z.enum(["verified", "needs_review"]),
          version: z.number().int().nonnegative(),
        })
        .parse(req.body);
      if (body.version !== expected)
        return res
          .status(409)
          .json({ message: "Application changed. Refresh and try again." });
      if (["Approved", "Rejected"].includes(record.status))
        return res.status(409).json({ message: "This application is closed." });
      const doc = record.documents.find(
        (item) => item.id === req.params.documentId,
      );
      if (!doc?.fileId)
        return res
          .status(400)
          .json({ message: "Upload a file before verification" });
      doc.status = body.status;
      const verified = record.documents.filter(
        (item) => item.status === "verified",
      ).length;
      record.progress =
        20 + Math.round((verified / record.documents.length) * 30);
      record.status =
        verified === record.documents.length
          ? "Officer review"
          : "Document pre-check";
      record.timeline = buildTimeline(record.status, record.timeline);
      record.risk = calculateRisk(
        record.serviceId,
        Math.round((verified / record.documents.length) * 100),
      );
      await saveApplication(record, expected);
      await notify(
        record.userId,
        "Document review updated",
        `${doc.name}: ${doc.status.replaceAll("_", " ")}`,
        "applications",
      );
      res.json(record);
    });
  },
);
app.patch(
  "/api/admin/applications/:id/status",
  auth,
  admin,
  async (req: AuthedRequest, res) => {
    await locked(String(req.params.id), async () => {
      const record = await ownedApplication(req);
      const body = z
        .object({
          status: z.enum(statuses),
          version: z.number().int().nonnegative(),
        })
        .parse(req.body);
      const expected = record.version || 0;
      if (expected !== body.version)
        return res
          .status(409)
          .json({ message: "Application changed. Refresh and try again." });
      if (["Approved", "Rejected"].includes(record.status))
        return res
          .status(409)
          .json({ message: "This application is already closed." });
      if (
        body.status !== "Rejected" &&
        record.documents.some((doc) => doc.status !== "verified")
      )
        return res
          .status(409)
          .json({
            message: "Verify all documents before advancing the application",
          });
      const transitions: Record<string, string[]> = {
        "Document pre-check": ["Officer review"],
        "Officer review": ["Payment/appointment", "Approved"],
        "Payment/appointment": ["Approved"],
      };
      if (
        body.status !== "Rejected" &&
        !transitions[record.status]?.includes(body.status)
      )
        return res
          .status(409)
          .json({ message: "Choose the next workflow stage" });
      record.status = body.status;
      record.progress =
        body.status === "Approved" || body.status === "Rejected"
          ? 100
          : body.status === "Payment/appointment"
            ? 80
            : 50;
      record.timeline = buildTimeline(record.status, record.timeline);
      await saveApplication(record, expected);
      await notify(
        record.userId,
        "Application status updated",
        `${record.serviceTitle}: ${record.status}`,
        "applications",
      );
      res.json(record);
    });
  },
);

app.get("/api/dashboard", auth, async (req: AuthedRequest, res) => {
  const userApps = newest(
    await store.list<ApplicationRecord>("application", req.user!.id),
  );
  const missingDocs = userApps.reduce(
    (sum, item) =>
      sum + item.documents.filter((doc) => doc.status !== "verified").length,
    0,
  );
  const highestRisk = userApps.reduce(
    (risk, item) => Math.max(risk, item.risk),
    0,
  );
  res.json({
    metrics: {
      openApplications: userApps.filter(
        (item) => !["Approved", "Rejected"].includes(item.status),
      ).length,
      verifiedDocuments: userApps.reduce(
        (sum, item) =>
          sum +
          item.documents.filter((doc) => doc.status === "verified").length,
        0,
      ),
      missingDocuments: missingDocs,
      highestDelayRisk: highestRisk,
    },
    nextActions: userApps.length
      ? userApps
          .flatMap((item) =>
            item.documents
              .filter((doc) => doc.status !== "verified")
              .slice(0, 2)
              .map((doc) => ({
                applicationId: item.id,
                documentId: doc.id,
                documentName: doc.name,
                title: `Upload ${doc.name}`,
                service: item.serviceTitle,
              })),
          )
          .slice(0, 4)
      : [
          {
            applicationId: "",
            documentId: "",
            documentName: "",
            title: "Run eligibility checker and start your first application",
            service: "Getting started",
          },
        ],
    recentApplications: userApps.slice(0, 4),
  });
});

app.post("/api/delay-prediction", auth, async (req: AuthedRequest, res) => {
  const body = z
    .object({
      urgency: z.coerce.number().min(0).max(100).default(50),
      serviceId: z.string().optional(),
    })
    .parse(req.body);
  const records = await store.list<ApplicationRecord>("application");
  const queue = records.filter(
    (item) =>
      !["Approved", "Rejected"].includes(item.status) &&
      (!body.serviceId || item.serviceId === body.serviceId),
  );
  const own = queue.filter((item) => item.userId === req.user!.id);
  const total = own.reduce((count, item) => count + item.documents.length, 0);
  const missing = own.reduce(
    (count, item) =>
      count + item.documents.filter((doc) => doc.status !== "verified").length,
    0,
  );
  const documentRisk = total ? (missing / total) * 35 : 0;
  const risk = Math.min(
    95,
    Math.round(queue.length * 3 + documentRisk + body.urgency * 0.2),
  );
  res.json({
    risk,
    label:
      risk > 65
        ? "High estimated delay risk"
        : risk > 35
          ? "Moderate estimated delay risk"
          : "Low estimated delay risk",
    drivers: [
      `${queue.length} pending CivicFlow applications in the current queue`,
      `${missing} of your ${total} documents await verification`,
      "Rule-based estimate; official department capacity is not connected",
    ],
  });
});

app.post("/api/complaints", auth, async (req: AuthedRequest, res) => {
  const body = z
    .object({
      subject: z.string().trim().min(3).max(200),
      department: z.string().trim().min(2).max(100),
      priority: z.enum(["Medium", "High", "Urgent"]).default("Medium"),
      draft: z.string().max(10000).default(""),
      applicationId: z.string().optional(),
    })
    .parse(req.body);
  if (body.applicationId) {
    const application = await store.get<ApplicationRecord>(
      "application",
      body.applicationId,
    );
    if (!application || application.userId !== req.user!.id)
      return res.status(404).json({ message: "Application not found" });
  }
  const record: Complaint = {
    ...body,
    id: `CMP-${randomUUID()}`,
    userId: req.user!.id,
    status: "Acknowledged",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 0,
  };
  await store.put("complaint", record);
  await notify(
    record.userId,
    "Complaint acknowledged",
    record.subject,
    "complaints",
  );
  res.json(record);
});
app.get("/api/complaints", auth, async (req: AuthedRequest, res) =>
  res.json(newest(await store.list<Complaint>("complaint", req.user!.id))),
);
app.patch("/api/admin/complaints/:id", auth, admin, async (req, res) => {
  await locked(`complaint:${req.params.id}`, async () => {
    const body = z
      .object({
        status: z.enum(["In progress", "Resolved"]),
        response: z.string().trim().min(3).max(2000),
        version: z.number().int().nonnegative(),
      })
      .parse(req.body);
    const record = await store.get<Complaint>(
      "complaint",
      String(req.params.id),
    );
    if (!record)
      return res.status(404).json({ message: "Complaint not found" });
    if ((record.version || 0) !== body.version || record.status === "Resolved")
      return res
        .status(409)
        .json({
          message:
            "Complaint changed or is already resolved. Refresh and try again.",
        });
    const expected = record.version || 0;
    Object.assign(record, {
      status: body.status,
      response: body.response,
      updatedAt: new Date().toISOString(),
      version: expected + 1,
    });
    if (store.pool) {
      const result = await store.pool.query(
        "UPDATE civic_records SET record=$1 WHERE kind='complaint' AND id=$2 AND COALESCE((record->>'version')::int,0)=$3",
        [record, record.id, expected],
      );
      if (!result.rowCount)
        return res
          .status(409)
          .json({ message: "Complaint changed. Refresh and try again." });
    } else await store.put("complaint", record);
    await notify(
      record.userId,
      "Complaint updated",
      `${record.subject}: ${record.status}`,
      "complaints",
    );
    res.json(record);
  });
});

app.post("/api/complaints/draft", auth, async (req: AuthedRequest, res) => {
  const draft = await askAi("complaint-draft", {
    ...req.body,
    userName: req.user!.name,
  });
  res.json({
    draft,
    escalationPath: [
      "Department helpdesk",
      "SLA officer",
      "District grievance cell",
    ],
    suggestedPriority: req.body.applicationId ? "High" : "Medium",
  });
});

app.get("/api/notifications", auth, async (req: AuthedRequest, res) =>
  res.json(
    newest(await store.list<Note>("notification", req.user!.id)).slice(0, 100),
  ),
);
app.patch(
  "/api/notifications/:id/read",
  auth,
  async (req: AuthedRequest, res) => {
    const note = await store.get<Note>("notification", String(req.params.id));
    if (!note || note.userId !== req.user!.id)
      return res.status(404).json({ message: "Notification not found" });
    note.readAt ||= new Date().toISOString();
    await store.put("notification", note);
    await realtime.publish(note.userId, "notifications");
    res.json(note);
  },
);
app.post(
  "/api/ocr/verify",
  auth,
  upload.single("document"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ message: "Choose a document first" });
    res.json(await recognize(req.file.buffer, req.body.documentType));
  },
);

app.post("/api/chat", auth, async (req: AuthedRequest, res) => {
  const message = String(req.body.message || "");
  const reply = await askAi("chat", { message, userName: req.user!.name });
  const suggestedServices = recommendServices({
    income: req.body.income,
    age: req.body.age,
  }).slice(0, 2);
  res.json({
    reply,
    suggestedServices,
    actions: [
      "Check eligibility",
      "Generate checklist",
      "Draft application",
      "Predict delay",
    ],
  });
});

app.post(
  "/api/assistant/application-plan",
  auth,
  async (req: AuthedRequest, res) => {
    const service =
      services.find((item) => item.id === req.body.serviceId) || services[0];
    const draft = await askAi("application-draft", {
      ...req.body,
      serviceId: service.id,
      userName: req.user!.name,
    });
    res.json({
      service,
      draft,
      steps: [
        "Confirm eligibility from age, income, address, and category details.",
        "Verify every required document before submission.",
        "Submit application draft with citizen declaration.",
        "Track department review and respond to objections.",
      ],
      blockers: service.documents
        .slice(0, 2)
        .map((doc) => `Missing or unclear ${doc} can delay approval.`),
      readinessScore: Math.max(48, 96 - service.documents.length * 7),
    });
  },
);

app.post("/api/translate", auth, async (req, res) => {
  const language = String(req.body.language || "Hindi");
  const text = String(req.body.text || "");
  if (!openrouter)
    return res
      .status(503)
      .json({
        message: "Translation requires an OPENROUTER_API_KEY on the backend.",
      });
  const translated = await askAi("translate", { language, text });
  res.json({ language, translated });
});

app.get("/api/admin/overview", auth, admin, async (_req, res) => {
  const applications = newest(
    await store.list<ApplicationRecord>("application"),
  );
  const complaints = newest(await store.list<Complaint>("complaint"));
  res.json({
    metrics: {
      applications: applications.length,
      complaints: complaints.length,
      pending: applications.filter(
        (item) => !["Approved", "Rejected"].includes(item.status),
      ).length,
      resolvedComplaints: complaints.filter(
        (item) => item.status === "Resolved",
      ).length,
    },
    queues: [...new Set(services.map((item) => item.department))].map(
      (department) => ({
        department,
        pending: applications.filter(
          (item) =>
            item.department === department &&
            !["Approved", "Rejected"].includes(item.status),
        ).length,
      }),
    ),
    applications,
    complaints,
  });
});

app.get("/api/meta", (_req, res) =>
  res.json({
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
      "Voice Assistant",
    ],
  }),
);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res
      .status(400)
      .json({ message: "Invalid request", details: err.issues });
  if (err instanceof multer.MulterError)
    return res
      .status(400)
      .json({
        message:
          err.code === "LIMIT_FILE_SIZE"
            ? "Maximum file size is 8 MB"
            : err.message,
      });
  if (err instanceof Error && "status" in err)
    return res.status(Number(err.status)).json({ message: err.message });
  if (err instanceof SyntaxError)
    return res.status(400).json({ message: "Invalid JSON request" });
  if (
    typeof err === "object" &&
    err &&
    "code" in err &&
    (err.code === "23505" || ("errcode" in err && err.errcode === 2067))
  )
    return res.status(409).json({ message: "Email already registered" });
  console.error(err);
  res.status(500).json({ message: "Something went wrong" });
});

boot()
  .then(() => {
    const server = app.listen(port, "0.0.0.0", () =>
      console.log(
        `CivicFlow AI API running on port ${port} (${store.pool ? "Postgres" : "SQLite"})`,
      ),
    );
    async function shutdown() {
      await realtime.close();
      server.close(async () => {
        await store.close();
        process.exit(0);
      });
    }
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((error) => {
    console.error("API startup failed", error);
    process.exit(1);
  });
