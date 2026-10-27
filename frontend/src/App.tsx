import { api, run } from "./api";
import { useLiveRefresh, useRealtime } from "./live";
import { AdminPage, TrackingPage } from "./Workflows";
import { Runtime, ServerSettings } from "./Runtime";
import { motion } from "framer-motion";
import {
  Bell,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileSearch,
  FileText,
  Gauge,
  Globe2,
  Home,
  Languages,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Mic,
  ScanLine,
  Search,
  Send,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import type { AxiosError } from "axios";

const Scene = lazy(() => import("./Scene"));

type User = {
  id: string;
  name: string;
  email: string;
  role: "citizen" | "admin";
};
type Service = {
  id: string;
  title: string;
  department: string;
  category: string;
  duration: string;
  fee: string;
  popularity: number;
  description: string;
  documents: string[];
};
type AppDocument = {
  id: string;
  name: string;
  required: boolean;
  status: "missing" | "verified" | "needs_review";
};
type AppRecord = {
  id: string;
  serviceId: string;
  serviceTitle: string;
  department: string;
  status: string;
  progress: number;
  eta: string;
  risk: number;
  documents: AppDocument[];
  timeline: { label: string; at: string; done: boolean }[];
  draft: string;
  createdAt: string;
};
type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt?: string;
  createdAt: string;
};
type EligibilityItem = { service: Service; eligible: boolean; reason: string };
type EligibilityResult = { score: number; eligible: EligibilityItem[] };
type ChecklistResult = {
  checklist: { id: string; name: string; required: boolean; status: string }[];
};
type DelayResult = { risk: number; label: string; drivers: string[] };
type OcrResult = {
  confidence: number;
  verified: boolean;
  issues: string[];
  checks: { label: string; ok: boolean }[];
  extracted: Record<string, string | boolean>;
};
type DashboardAction = {
  applicationId: string;
  documentId: string;
  documentName: string;
  title: string;
  service: string;
};
type DashboardData = {
  metrics: Record<string, number>;
  nextActions: DashboardAction[];
  recentApplications: AppRecord[];
};
type ApplicationPlan = {
  service: Service;
  draft: string;
  steps: string[];
  blockers: string[];
  readinessScore: number;
};
type SpeechRecognitionLike = {
  lang: string;
  start: () => void;
  onresult:
    ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const features = [
  [
    "Eligibility Checker",
    "Profile-based government service fit scoring.",
    CheckCircle2,
  ],
  [
    "AI Assistant",
    "Ask for service, document, complaint, and tracking help.",
    Bot,
  ],
  [
    "Document Assistant",
    "Dynamic checklist plus OCR pre-verification.",
    ClipboardCheck,
  ],
  [
    "Track Applications",
    "Live status, SLA risk, documents, and complaints.",
    FileSearch,
  ],
  [
    "AI Recommendations",
    "OpenRouter-powered guidance with local fallback.",
    Sparkles,
  ],
  ["Voice + Multilingual", "Assist citizens in the language they prefer.", Mic],
];

const impactStats = [
  [
    "Live",
    "application updates",
    "Officer actions appear automatically on citizen screens",
  ],
  [
    "Private",
    "document uploads",
    "Only the applicant and authorized officers can retrieve files",
  ],
  [
    "Saved",
    "across restarts",
    "Applications, complaints and notifications persist in a database",
  ],
  [
    "20+",
    "service workflows",
    "Certificates, identity, education, employment, pension, housing, health, and complaints",
  ],
];

const testimonials = [
  [
    "CivicFlow turned a messy certificate process into a clean checklist and draft in minutes.",
    "Aarav Mehta",
    "Student applicant",
  ],
  [
    "The dashboard finally shows what is pending instead of making people guess where they are stuck.",
    "Nisha Rao",
    "Service center operator",
  ],
  [
    "Delay prediction and complaint drafts make the product feel like an actual assistant, not another form portal.",
    "Imran Khan",
    "Municipal workflow lead",
  ],
];

const workflowSteps = [
  [
    "1",
    "Check eligibility",
    "Enter age, income, address/property signals and see matched services instantly.",
  ],
  [
    "2",
    "Choose a service",
    "Pick certificates, identity, scholarship, employment, pension, housing, health, or complaint support.",
  ],
  [
    "3",
    "Prepare documents",
    "Generate a checklist, upload files, and run OCR verification before submission.",
  ],
  [
    "4",
    "Apply and track",
    "Create an AI draft, follow status, predict estimated delay risk, and raise complaints when needed.",
  ],
];

const serviceHighlights = [
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
];

function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("civicflow_user");
    try {
      return raw && localStorage.getItem("civicflow_token")
        ? JSON.parse(raw)
        : null;
    } catch {
      return null;
    }
  });
  const token = user ? localStorage.getItem("civicflow_token") : null;
  useRealtime(token);
  useEffect(() => {
    const logout = () => {
      localStorage.removeItem("civicflow_token");
      localStorage.removeItem("civicflow_user");
      setUser(null);
    };
    window.addEventListener("civicflow:logout", logout);
    if (localStorage.getItem("civicflow_token"))
      void run(async () => {
        const { data } = await api.get("/me");
        setUser(data);
        localStorage.setItem("civicflow_user", JSON.stringify(data));
      });
    return () => window.removeEventListener("civicflow:logout", logout);
  }, []);
  useEffect(() => {
    api.defaults.headers.common.Authorization = token ? `Bearer ${token}` : "";
  }, [token, user]);
  return {
    user,
    token,
    save(session: { token: string; user: User }) {
      localStorage.setItem("civicflow_token", session.token);
      localStorage.setItem("civicflow_user", JSON.stringify(session.user));
      api.defaults.headers.common.Authorization = `Bearer ${session.token}`;
      setUser(session.user);
    },
    logout() {
      localStorage.removeItem("civicflow_token");
      localStorage.removeItem("civicflow_user");
      delete api.defaults.headers.common.Authorization;
      setUser(null);
    },
  };
}

function Shell({
  children,
  auth,
}: {
  children: ReactNode;
  auth: ReturnType<typeof useAuth>;
}) {
  const [open, setOpen] = useState(false);
  const links: Array<[string, string, typeof Home]> = [
    ["/", "Home", Home],
    ["/eligibility", "Eligibility", CheckCircle2],
    ["/services", "Services", Search],
    ["/documents", "Documents", ClipboardCheck],
    ["/dashboard", "Dashboard", LayoutDashboard],
    ["/assistant", "Assistant", Bot],
    ["/tracking", "Tracking", FileSearch],
  ];
  if (auth.user?.role === "admin") links.push(["/admin", "Officer", Gauge]);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/72 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-400 text-slate-950 shadow-lg shadow-teal-400/25">
              <Sparkles size={21} />
            </span>
            <span>
              <strong className="block text-lg leading-5">CivicFlow AI</strong>
              <span className="text-xs text-slate-400">
                Public service autopilot
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {links.map(([to, label, Icon]) => (
              <NavLink
                key={to as string}
                to={to as string}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm ${isActive ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/8"}`
                }
              >
                <Icon size={16} className="mr-2 inline" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {auth.user ? (
              <button
                onClick={auth.logout}
                className="rounded-md border border-white/15 px-3 py-2 text-sm text-slate-200"
              >
                <LogOut size={16} className="mr-2 inline" />
                Logout
              </button>
            ) : (
              <Link
                to="/auth"
                className="rounded-md bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950"
              >
                Sign in
              </Link>
            )}
          </div>
          <button
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
            className="rounded-md border border-white/15 p-2 lg:hidden"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="grid gap-1 border-t border-white/10 px-4 py-3 lg:hidden">
            {links.map(([to, label]) => (
              <Link
                onClick={() => setOpen(false)}
                key={to as string}
                to={to as string}
                className="rounded-md px-3 py-2 text-slate-200"
              >
                {label as string}
              </Link>
            ))}
            {auth.user ? (
              <button
                onClick={() => {
                  auth.logout();
                  setOpen(false);
                }}
                className="p-3 text-left"
              >
                Logout
              </button>
            ) : (
              <Link to="/auth" onClick={() => setOpen(false)} className="p-3">
                Sign in
              </Link>
            )}
          </div>
        )}
      </header>
      <Runtime signedIn={!!auth.user} />
      {children}
    </div>
  );
}

function HomePage() {
  return (
    <main className="page-shell">
      <section className="grid-glow relative overflow-hidden">
        <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl items-center gap-8 px-3 py-8 sm:px-4 sm:py-10 lg:grid-cols-[1fr_0.9fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-teal-300/30 bg-teal-300/10 px-3 py-2 text-xs text-teal-100 sm:px-4 sm:text-sm">
              <Sparkles size={16} /> Startup-grade civic service assistant
            </div>
            <h1 className="hero-title max-w-4xl text-5xl font-black leading-[1.02] tracking-normal text-white md:text-7xl">
              AI-powered public service applications without confusion.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:mt-6 sm:text-lg sm:leading-8">
              CivicFlow AI helps citizens discover services, verify documents,
              generate checklists, submit applications, predict delays, raise
              complaints, and chat in multiple languages.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
              <Link
                to="/auth"
                className="neon-button flash inline-flex rounded-md px-5 py-3 font-bold"
              >
                Launch CivicFlow <ChevronRight className="inline" size={18} />
              </Link>
              <Link
                to="/services"
                className="ghost-button inline-flex rounded-md px-5 py-3 font-semibold text-white"
              >
                Explore services
              </Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-3">
              {[
                ["Live", "status updates"],
                ["OCR", "text extraction"],
                ["Saved", "application history"],
              ].map(([n, label]) => (
                <div
                  className="metric-card rounded-lg p-4 side-reveal"
                  key={label}
                >
                  <strong className="block text-2xl text-white">{n}</strong>
                  <span className="text-xs text-slate-300">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
          <div className="relative h-[330px] sm:h-[420px] lg:h-[620px]">
            <div className="absolute inset-0 rounded-2xl border border-white/10 bg-slate-950/20 sm:rounded-[2rem]" />
            <Suspense
              fallback={
                <div className="grid h-full place-items-center text-slate-400">
                  CivicFlow · Public services
                </div>
              }
            >
              <Scene />
            </Suspense>
            <div className="glass shine-card absolute bottom-3 left-3 right-3 rounded-xl p-3 sm:bottom-6 sm:left-5 sm:right-5 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <strong className="block">
                    Live application intelligence
                  </strong>
                  <small className="text-slate-300">
                    Eligibility, OCR, SLA and chatbot signals in one flow
                  </small>
                </span>
                <span className="w-fit rounded-md bg-emerald-300 px-3 py-2 text-sm font-black text-slate-950">
                  Track live
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-3 py-12 sm:px-4 sm:py-16">
        <div className="mb-12 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="panel shine-card rounded-lg p-5 sm:p-6">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-300">
              Clear user flow
            </p>
            <h2 className="page-title mt-2 text-3xl font-black md:text-5xl">
              No guessing what to do next.
            </h2>
            <p className="mt-4 leading-7 text-slate-400">
              CivicFlow is now organized around the actual journey: check
              eligibility, select a service, prepare documents, create the
              application, then track or complain.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                to="/eligibility"
                className="neon-button rounded-md px-4 py-3 text-center font-black"
              >
                Start with eligibility
              </Link>
              <Link
                to="/services"
                className="ghost-button rounded-md px-4 py-3 text-center font-bold"
              >
                Browse all services
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workflowSteps.map(([step, title, detail]) => (
              <motion.div
                whileHover={{ y: -4 }}
                className="glass shine-card rounded-lg p-4"
                key={title}
              >
                <span className="grid h-9 w-9 place-items-center rounded-md bg-teal-300 text-sm font-black text-slate-950">
                  {step}
                </span>
                <h3 className="mt-4 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {detail}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="mb-12 panel rounded-lg p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">
                Added services
              </p>
              <h2 className="page-title mt-2 text-3xl font-black">
                Every major civic journey in one place.
              </h2>
            </div>
            <Link
              to="/services"
              className="ghost-button w-fit rounded-md px-4 py-3 text-sm font-bold"
            >
              Open service directory
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {serviceHighlights.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-sm text-slate-200"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">
              Product proof
            </p>
            <h2 className="page-title mt-2 text-3xl font-black md:text-5xl">
              Numbers that make the flow feel real.
            </h2>
          </div>
          <p className="max-w-xl text-slate-400">
            Designed around the actual friction points: missing documents,
            unclear eligibility, slow reviews, and complaint escalation.
          </p>
        </div>
        <div className="mb-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {impactStats.map(([number, label, detail], index) => (
            <motion.div
              initial={{ opacity: 0, x: index % 2 ? 24 : -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
              className="metric-card orbital-card rounded-lg p-6"
              key={label}
            >
              <strong className="block text-4xl font-black text-white">
                {number}
              </strong>
              <span className="mt-2 block font-bold text-teal-200">
                {label}
              </span>
              <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
            </motion.div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(([title, desc, Icon]) => (
            <motion.div
              whileHover={{ y: -6, rotateX: 2 }}
              className="panel shine-card rounded-lg p-6"
              key={title as string}
            >
              <Icon className="mb-5 text-teal-300" />
              <h3 className="text-xl font-bold">{title as string}</h3>
              <p className="mt-3 text-slate-400">{desc as string}</p>
            </motion.div>
          ))}
        </div>
      </section>
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-7xl px-3 py-12 sm:px-4 sm:py-14">
          <div className="mb-8">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-300">
              Testimonials
            </p>
            <h2 className="page-title mt-2 text-3xl font-black md:text-5xl">
              Trusted by the people who live inside the process.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map(([quote, name, role], i) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass shine-card rounded-lg p-5 sm:p-6"
                key={name}
              >
                <div className="mb-5 inline-flex rounded-full bg-amber-300/15 px-3 py-1 text-sm font-bold text-amber-200">
                  5.0 civic trust rating
                </div>
                <p className="text-lg leading-8 text-white">{quote}</p>
                <span className="mt-5 block font-bold text-teal-200">
                  {name}
                </span>
                <span className="text-sm text-slate-400">{role}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function AuthPage({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const payload = Object.fromEntries(form.entries());
      const { data } = await api.post(`/auth/${mode}`, payload);
      auth.save(data);
      navigate("/dashboard");
    } catch (err: unknown) {
      const apiError = err as AxiosError<{ message?: string }>;
      setError(apiError.response?.data?.message || "Could not authenticate");
    }
  }
  return (
    <main className="page-shell mx-auto grid min-h-[calc(100vh-72px)] max-w-6xl items-center gap-8 px-3 py-8 sm:px-4 sm:py-10 lg:grid-cols-2">
      <div>
        <h1 className="page-title text-4xl font-black sm:text-5xl">
          Secure citizen access
        </h1>
        <p className="mt-4 text-slate-300">
          Create a citizen account. Officers sign in with the admin credentials
          configured by your server administrator.
        </p>
        <div className="mt-8 grid gap-3">
          {[
            "JWT authentication",
            "Neon Postgres ready",
            "Role-based admin panel",
          ].map((x) => (
            <div className="glass rounded-lg p-4" key={x}>
              <Lock className="mr-3 inline text-teal-300" size={18} />
              {x}
            </div>
          ))}
        </div>
        <ServerSettings />
      </div>
      <form onSubmit={submit} className="glass rounded-xl p-4 sm:p-6">
        <div className="mb-5 flex rounded-lg bg-slate-950/70 p-1">
          {(["register", "login"] as const).map((item) => (
            <button
              type="button"
              onClick={() => setMode(item)}
              className={`flex-1 rounded-md py-2 font-bold ${mode === item ? "bg-teal-300 text-slate-950" : "text-slate-300"}`}
              key={item}
            >
              {item === "register" ? "Register" : "Login"}
            </button>
          ))}
        </div>
        {mode === "register" && (
          <input
            name="name"
            required
            placeholder="Full name"
            className="mb-3 w-full rounded-md border border-white/10 bg-slate-950/70 px-4 py-3 outline-none focus:border-teal-300"
          />
        )}
        <input
          name="email"
          required
          type="email"
          placeholder="Email"
          className="mb-3 w-full rounded-md border border-white/10 bg-slate-950/70 px-4 py-3 outline-none focus:border-teal-300"
        />
        <input
          name="password"
          required
          minLength={mode === "register" ? 8 : 1}
          type="password"
          placeholder="Password"
          className="mb-3 w-full rounded-md border border-white/10 bg-slate-950/70 px-4 py-3 outline-none focus:border-teal-300"
        />
        {error && (
          <p className="mb-3 rounded-md bg-rose-500/15 p-3 text-sm text-rose-200">
            {error}
          </p>
        )}
        <button className="neon-button flash w-full rounded-md px-5 py-3 font-black">
          Continue
        </button>
      </form>
    </main>
  );
}

function Protected({
  auth,
  children,
}: {
  auth: ReturnType<typeof useAuth>;
  children: ReactNode;
}) {
  return auth.user ? children : <Navigate to="/auth" replace />;
}

function Dashboard({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [uploading, setUploading] = useState("");
  async function refreshDashboard() {
    const [dashboard, notifications] = await Promise.all([
      api.get("/dashboard"),
      api.get("/notifications"),
    ]);
    setDashboard(dashboard.data);
    setNotes(notifications.data);
  }
  useLiveRefresh(refreshDashboard);
  async function uploadAction(action: DashboardAction, file: File | undefined) {
    if (!file || !action.applicationId || !action.documentId) return;
    setUploading(action.documentId);
    try {
      const form = new FormData();
      form.append("document", file);
      await api.post(
        `/applications/${action.applicationId}/documents/${action.documentId}/upload`,
        form,
      );
      await refreshDashboard();
    } finally {
      setUploading("");
    }
  }

  const metrics = dashboard?.metrics || {
    openApplications: 0,
    verifiedDocuments: 0,
    missingDocuments: 0,
    highestDelayRisk: 0,
  };
  return (
    <AppFrame
      title={`Welcome, ${auth.user?.name}`}
      kicker="Citizen command center"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          ["Open applications", metrics.openApplications],
          ["Verified documents", metrics.verifiedDocuments],
          ["Missing documents", metrics.missingDocuments],
          ["Highest estimated delay risk", `${metrics.highestDelayRisk}%`],
        ].map(([a, b]) => (
          <div className="metric-card rounded-lg p-4 sm:p-5" key={a}>
            <span className="text-xs text-slate-300 sm:text-sm">{a}</span>
            <strong className="mt-2 block text-2xl sm:text-3xl">{b}</strong>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <EligibilityPanel />
        <div className="panel rounded-lg p-4 sm:p-5">
          <h3 className="mb-4 text-xl font-bold">Next actions</h3>
          {dashboard?.nextActions.map((n) => (
            <label
              className="mobile-safe-text mb-3 block cursor-pointer rounded-md bg-white/5 p-4 transition hover:bg-white/10"
              key={`${n.applicationId}-${n.documentId || n.title}`}
            >
              <Upload className="mr-2 inline text-amber-300" size={16} />
              <b>
                {uploading && uploading === n.documentId
                  ? "Checking document..."
                  : n.title}
              </b>
              <p className="mt-1 text-sm text-slate-400">{n.service}</p>
              {n.documentId && (
                <>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,application/pdf"
                    disabled={!!uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void run(() => uploadAction(n, file));
                    }}
                  />
                  <span className="mt-3 inline-flex rounded-md border border-white/15 px-3 py-2 text-xs text-slate-200">
                    Choose file and verify
                  </span>
                </>
              )}
            </label>
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="panel rounded-lg p-4 sm:p-5">
          <h3 className="mb-4 text-xl font-bold">Live applications</h3>
          {dashboard?.recentApplications.length === 0 && (
            <p className="text-slate-400">
              Apply for a service to activate this workspace.
            </p>
          )}
          {dashboard?.recentApplications.map((app) => (
            <ApplicationStrip key={app.id} app={app} />
          ))}
        </div>
        <div className="panel rounded-lg p-4 sm:p-5">
          <h3 className="mb-4 text-xl font-bold">Notifications</h3>
          {notes.map((n) => (
            <div className="mb-3 rounded-md bg-white/5 p-4" key={n.id}>
              <Bell className="mr-2 inline text-amber-300" size={16} />
              <b>{n.title}</b>
              <p className="mt-1 text-sm text-slate-400">{n.body}</p>
              <small>{new Date(n.createdAt).toLocaleString()}</small>
              {!n.readAt && (
                <button
                  className="ml-3 text-sm text-teal-200"
                  onClick={() =>
                    void run(async () => {
                      await api.patch(`/notifications/${n.id}/read`);
                      await refreshDashboard();
                    })
                  }
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}

function ApplicationStrip({ app }: { app: AppRecord }) {
  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <b className="mobile-safe-text block">{app.serviceTitle}</b>
          <p className="mobile-safe-text text-sm text-slate-400">
            {app.department} | {app.id}
          </p>
        </div>
        <span
          className={`rounded-md px-3 py-1 text-sm font-bold ${app.risk > 65 ? "bg-rose-300 text-slate-950" : "bg-teal-300 text-slate-950"}`}
        >
          {app.risk}% estimated delay risk
        </span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-800">
        <div
          className="h-2 rounded-full bg-teal-300"
          style={{ width: `${app.progress}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-slate-300">
        {app.status} | ETA {app.eta}
      </p>
    </div>
  );
}

function EligibilityPanel() {
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [summary, setSummary] = useState("");
  async function check(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await api.post("/eligibility", {
      ...data,
      ownsProperty: data.ownsProperty === "on",
    });
    setResult(res.data);
    try {
      const ai = await api.post("/recommendations", {
        ...data,
        ownsProperty: data.ownsProperty === "on",
      });
      setSummary(ai.data.summary);
    } catch {
      setSummary(
        "AI recommendations will appear after sign in and profile check.",
      );
    }
  }
  return (
    <div className="panel rounded-lg p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Eligibility checker</h3>
          <p className="mt-1 text-sm text-slate-400">
            Find matching services before starting an application.
          </p>
        </div>
        {result && (
          <span className="w-fit rounded-md bg-teal-300 px-3 py-2 text-sm font-black text-slate-950">
            {result.score}% profile fit
          </span>
        )}
      </div>
      <form
        onSubmit={(event) => void run(() => check(event))}
        className="mt-4 grid gap-3 md:grid-cols-5"
      >
        <input
          name="age"
          type="number"
          placeholder="Age"
          className="rounded-md bg-slate-950/70 px-3 py-3"
        />
        <input
          name="income"
          type="number"
          placeholder="Annual income"
          className="rounded-md bg-slate-950/70 px-3 py-3"
        />
        <select
          name="category"
          className="rounded-md bg-slate-950/70 px-3 py-3"
        >
          <option>General citizen</option>
          <option>Student</option>
          <option>Senior citizen</option>
          <option>Person with disability</option>
          <option>Job seeker</option>
        </select>
        <label className="flex min-h-12 items-center gap-2 rounded-md bg-slate-950/70 px-3">
          <input name="ownsProperty" type="checkbox" />
          Owns property
        </label>
        <button className="neon-button rounded-md px-4 py-3 font-black">
          Check
        </button>
      </form>
      {summary && (
        <p className="mt-4 rounded-md bg-teal-300/10 p-3 text-sm leading-6 text-teal-100">
          {summary}
        </p>
      )}
      {result && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {result.eligible.slice(0, 6).map((x) => (
            <Link
              to="/services"
              className="rounded-md bg-white/5 p-4 transition hover:bg-white/10"
              key={x.service.id}
            >
              <b>{x.service.title}</b>
              <p className="mt-1 text-sm text-slate-400">{x.reason}</p>
              <span className="mt-3 inline-flex rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300">
                Open in services
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EligibilityPage() {
  return (
    <AppFrame
      title="Eligibility Checker"
      kicker="Start here if you are confused"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_0.65fr]">
        <EligibilityPanel />
        <div className="glass rounded-lg p-4 sm:p-5">
          <h3 className="text-xl font-bold">How this helps</h3>
          <div className="mt-4 grid gap-3">
            {[
              "Matches your profile to real services",
              "Explains why each service is relevant",
              "Sends you to the correct application flow",
              "Works for certificates, benefits, identity, jobs, health, housing, and education",
            ].map((item) => (
              <div
                className="rounded-md bg-white/5 p-3 text-sm text-slate-300"
                key={item}
              >
                <CheckCircle2
                  className="mr-2 inline text-emerald-300"
                  size={15}
                />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  useEffect(() => {
    void run(async () => setServices((await api.get("/services")).data));
  }, []);
  const categories = [
    "All",
    ...Array.from(new Set(services.map((service) => service.category))),
  ];
  const filtered = services.filter(
    (s) =>
      (category === "All" || s.category === category) &&
      `${s.title} ${s.department} ${s.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <AppFrame
      title="Service Directory"
      kicker="Prepare and track a request in CivicFlow"
    >
      <p className="mb-4 text-sm text-slate-400">
        Service requirements, fees, and timelines are reference guidance.
        Confirm them with the relevant department; CivicFlow does not connect to
        government portals.
      </p>
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 sm:px-4">
          <Search className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search income, Aadhaar, PAN, pension, scholarship..."
            className="w-full bg-transparent text-sm outline-none sm:text-base"
          />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`shrink-0 rounded-md px-3 py-3 text-sm font-bold ${category === item ? "bg-teal-300 text-slate-950" : "border border-white/10 bg-white/5 text-slate-300"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        {features.slice(0, 4).map(([title, desc, Icon]) => (
          <div className="glass rounded-lg p-4" key={title as string}>
            <Icon className="mb-3 text-teal-300" size={20} />
            <b>{title as string}</b>
            <p className="mt-1 text-xs text-slate-400">{desc as string}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>
    </AppFrame>
  );
}

function ServiceCard({ service }: { service: Service }) {
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [purpose, setPurpose] = useState("");
  const [created, setCreated] = useState<AppRecord | null>(null);
  const [applying, setApplying] = useState(false);
  async function generate() {
    setChecklist(
      (await api.post("/checklist", { serviceId: service.id })).data,
    );
  }
  async function apply() {
    if (applying) return;
    setApplying(true);
    try {
      const { data } = await api.post("/applications", {
        serviceId: service.id,
        purpose: purpose || `Apply for ${service.title}`,
      });
      setCreated(data);
    } finally {
      setApplying(false);
    }
  }
  return (
    <motion.div whileHover={{ y: -5 }} className="panel rounded-lg p-4 sm:p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <span className="rounded-md bg-teal-300/15 px-3 py-1 text-sm text-teal-200">
          {service.category}
        </span>
        <span className="text-sm text-slate-400">{service.duration}</span>
      </div>
      <h3 className="mobile-safe-text mt-4 text-2xl font-black">
        {service.title}
      </h3>
      <p className="mt-2 text-sm text-slate-400">{service.description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{service.department}</span>
        <b>{service.fee}</b>
      </div>
      <textarea
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        placeholder="Why do you need this service? AI will use this in the application draft."
        className="mt-4 min-h-24 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 py-3 text-sm outline-none focus:border-teal-300"
      />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => void run(generate)}
          className="ghost-button rounded-md px-3 py-3 text-sm"
        >
          <ClipboardCheck className="mr-2 inline" size={15} />
          Generate checklist
        </button>
        <button
          disabled={applying || !!created}
          onClick={() => void run(apply)}
          className="neon-button rounded-md px-3 py-3 text-sm font-bold"
        >
          <FileText className="mr-2 inline" size={15} />
          {applying
            ? "Creating…"
            : created
              ? "Application created"
              : "Create application"}
        </button>
      </div>
      {checklist && (
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {checklist.checklist.map((item) => (
            <li className="mobile-safe-text" key={item.id}>
              <CheckCircle2
                className="mr-2 inline text-emerald-300"
                size={15}
              />
              {item.name}
              <span className="ml-2 text-xs text-slate-500">{item.status}</span>
            </li>
          ))}
        </ul>
      )}
      {created && (
        <div className="mt-4 rounded-lg bg-emerald-300/10 p-4 text-sm">
          <b className="text-emerald-200">Application {created.id} created</b>
          <Link to="/tracking" className="ml-3 underline">
            Upload documents and track
          </Link>
          <p className="mobile-safe-text mt-2 text-slate-300">
            {created.draft}
          </p>
        </div>
      )}
    </motion.div>
  );
}

function DocumentsPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  useEffect(() => {
    void run(async () => {
      const { data } = await api.get("/services");
      setServices(data);
      setServiceId(data[0]?.id || "");
    });
  }, []);
  async function generateChecklist() {
    if (!serviceId) return;
    setChecklist((await api.post("/checklist", { serviceId })).data);
  }
  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setOcr((await api.post("/ocr/verify", fd)).data);
  }
  return (
    <AppFrame
      title="Document Assistant"
      kicker="Prepare documents before applying"
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <div className="panel rounded-lg p-4 sm:p-5">
          <h3 className="text-xl font-bold">
            <ClipboardCheck className="mr-2 inline text-teal-300" />
            Checklist generator
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="rounded-md bg-slate-950/70 px-4 py-3"
            >
              {services.map((service) => (
                <option value={service.id} key={service.id}>
                  {service.title}
                </option>
              ))}
            </select>
            <button
              onClick={() => void run(generateChecklist)}
              className="neon-button rounded-md px-4 py-3 font-black"
            >
              Generate checklist
            </button>
          </div>
          {checklist && (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {checklist.checklist.map((item) => (
                <div className="rounded-md bg-white/5 p-4" key={item.id}>
                  <b>{item.name}</b>
                  <p className="mt-1 text-sm text-slate-400">
                    {item.required ? "Required" : "Optional"} | {item.status}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <form
          onSubmit={(event) => void run(() => verify(event))}
          className="glass rounded-lg p-4 sm:p-5"
        >
          <h3 className="text-xl font-bold">
            <ScanLine className="mr-2 inline text-amber-300" />
            OCR verification
          </h3>
          <select
            name="documentType"
            className="mt-4 w-full rounded-md bg-slate-950/70 px-4 py-3"
          >
            <option>Aadhaar card</option>
            <option>Income proof</option>
            <option>Community proof</option>
            <option>Address proof</option>
            <option>Birth certificate</option>
            <option>Bank passbook</option>
            <option>Passport photo</option>
          </select>
          <input
            required
            accept="image/png,image/jpeg,application/pdf"
            name="document"
            type="file"
            className="mt-3 w-full rounded-md bg-slate-950/70 p-3"
          />
          <button className="mt-3 w-full rounded-md bg-amber-300 px-4 py-3 font-black text-slate-950">
            Verify document
          </button>
          {ocr && (
            <div className="mt-4 rounded-lg bg-white/5 p-4">
              <b>
                {ocr.verified ? "Text extracted" : "Officer review required"} |{" "}
                {ocr.confidence}% confidence
              </b>
              <div className="mt-3 grid gap-2">
                {ocr.checks.map((check) => (
                  <span
                    key={check.label}
                    className={`rounded-md px-3 py-2 text-sm ${check.ok ? "bg-emerald-300/15 text-emerald-100" : "bg-rose-300/15 text-rose-100"}`}
                  >
                    {check.ok ? "Pass" : "Fix"}: {check.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </AppFrame>
  );
}

function AssistantPage() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi, I can help with services, documents, complaints, OCR, and tracking.",
    },
  ]);
  const [delay, setDelay] = useState<DelayResult | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [plan, setPlan] = useState<ApplicationPlan | null>(null);
  const [complaintDraft, setComplaintDraft] = useState("");
  const [translated, setTranslated] = useState("");
  const [chatText, setChatText] = useState("");
  useEffect(() => {
    void run(async () => setServices((await api.get("/services")).data));
  }, []);
  async function chat(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setChatText("");
    const res = await api.post("/chat", { message: text });
    setMessages((m) => [...m, { role: "assistant", text: res.data.reply }]);
  }
  async function predict() {
    setDelay(
      (
        await api.post("/delay-prediction", {
          urgency: 70,
          documentQuality: ocr?.confidence || 82,
          departmentLoad: 64,
        })
      ).data,
    );
  }
  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setOcr((await api.post("/ocr/verify", fd)).data);
  }
  async function buildPlan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPlan(
      (
        await api.post(
          "/assistant/application-plan",
          Object.fromEntries(new FormData(e.currentTarget).entries()),
        )
      ).data,
    );
  }
  async function draftComplaint(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setComplaintDraft(
      (
        await api.post(
          "/complaints/draft",
          Object.fromEntries(new FormData(e.currentTarget).entries()),
        )
      ).data.draft,
    );
  }
  async function translatePlan(language: string) {
    if (!plan) return;
    setTranslated(
      (await api.post("/translate", { text: plan.draft, language })).data
        .translated,
    );
  }
  function voice() {
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition)
      return setChatText("Voice recognition is not supported in this browser.");
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.onresult = (event) =>
      setChatText(event.results[0][0].transcript);
    recognition.start();
  }
  return (
    <AppFrame title="AI Assistant" kicker="Real civic workflow engine">
      <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <div className="grid gap-4">
          <div className="panel rounded-lg p-4 sm:p-5">
            <h3 className="mb-4 text-xl font-bold">
              <Wand2 className="mr-2 inline text-teal-300" />
              Application plan builder
            </h3>
            <form
              onSubmit={(event) => void run(() => buildPlan(event))}
              className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
            >
              <select
                name="serviceId"
                className="rounded-md bg-slate-950/70 px-4 py-3"
              >
                {services.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <input
                name="purpose"
                placeholder="Purpose, e.g. scholarship, pension, address proof"
                className="rounded-md bg-slate-950/70 px-4 py-3"
              />
              <button className="rounded-md bg-teal-300 px-4 font-black text-slate-950">
                Build
              </button>
            </form>
            {plan && (
              <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1fr]">
                <div className="rounded-lg bg-white/5 p-4">
                  <b>{plan.service.title}</b>
                  <p className="mt-2 text-sm text-slate-400">Readiness score</p>
                  <strong className="text-4xl text-teal-300">
                    {plan.readinessScore}%
                  </strong>
                  <ul className="mt-4 space-y-2 text-sm text-slate-300">
                    {plan.steps.map((step) => (
                      <li key={step}>
                        <CheckCircle2
                          className="mr-2 inline text-emerald-300"
                          size={15}
                        />
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg bg-slate-950/70 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
                    {plan.draft}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["Hindi", "Marathi", "Tamil"].map((lang) => (
                      <button
                        key={lang}
                        onClick={() => void run(() => translatePlan(lang))}
                        className="rounded-md border border-white/15 px-3 py-2 text-sm"
                      >
                        <Languages className="mr-2 inline" size={14} />
                        {lang}
                      </button>
                    ))}
                  </div>
                  {translated && (
                    <p className="mt-4 rounded-md bg-sky-300/10 p-3 text-sm text-sky-100">
                      {translated}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="panel rounded-lg p-4 sm:p-5">
            <div className="h-[360px] overflow-auto rounded-lg bg-slate-950/60 p-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`mb-3 max-w-[85%] rounded-lg p-3 ${m.role === "user" ? "ml-auto bg-teal-300 text-slate-950" : "bg-white/8 text-slate-100"}`}
                >
                  {m.text}
                </div>
              ))}
            </div>
            <form
              onSubmit={(event) => void run(() => chat(event))}
              className="mt-3 grid grid-cols-[auto_1fr_auto] gap-2"
            >
              <button
                type="button"
                onClick={voice}
                className="rounded-md border border-white/15 px-3"
              >
                <Mic />
              </button>
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Ask about eligibility, documents, delays..."
                className="flex-1 rounded-md bg-slate-950/70 px-4 py-3"
              />
              <button className="rounded-md bg-teal-300 px-4 font-black text-slate-950">
                <Send />
              </button>
            </form>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="glass rounded-lg p-4 sm:p-5">
            <h3 className="font-bold">
              <ScanLine className="mr-2 inline text-teal-300" />
              OCR document verification
            </h3>
            <form
              onSubmit={(event) => void run(() => verify(event))}
              className="mt-3 grid gap-3"
            >
              <select
                name="documentType"
                className="rounded-md bg-slate-950/70 px-4 py-3"
              >
                <option>Aadhaar card</option>
                <option>Income proof</option>
                <option>Address proof</option>
                <option>Bank passbook</option>
              </select>
              <input
                required
                accept="image/png,image/jpeg,application/pdf"
                name="document"
                type="file"
                className="w-full rounded-md bg-slate-950/70 p-3"
              />
              <button className="rounded-md bg-amber-300 px-4 py-2 font-bold text-slate-950">
                Run verification
              </button>
            </form>
            {ocr && (
              <div className="mt-4">
                <p className="text-sm text-slate-300">
                  Confidence {ocr.confidence}%.{" "}
                  {ocr.verified ? "Text extracted." : ocr.issues[0]}
                </p>
                <div className="mt-3 grid gap-2">
                  {ocr.checks.map((check) => (
                    <span
                      key={check.label}
                      className={`rounded-md px-3 py-2 text-sm ${check.ok ? "bg-emerald-300/15 text-emerald-100" : "bg-rose-300/15 text-rose-100"}`}
                    >
                      {check.ok ? "Pass" : "Fix"}: {check.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="glass rounded-lg p-4 sm:p-5">
            <h3 className="font-bold">
              <Gauge className="mr-2 inline text-rose-300" />
              Delay prediction
            </h3>
            <button
              onClick={() => void run(predict)}
              className="mt-3 rounded-md bg-rose-300 px-4 py-2 font-bold text-slate-950"
            >
              Run risk model
            </button>
            {delay && (
              <div className="mt-3 text-sm text-slate-300">
                <b>
                  {delay.label}: {delay.risk}%
                </b>
                <ul className="mt-2 space-y-1">
                  {delay.drivers.map((d) => (
                    <li key={d}>
                      <Clock3 className="mr-2 inline" size={14} />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <form
            onSubmit={(event) => void run(() => draftComplaint(event))}
            className="glass rounded-lg p-4 sm:p-5"
          >
            <h3 className="font-bold">
              <FileSearch className="mr-2 inline text-sky-300" />
              Complaint draft
            </h3>
            <input
              name="subject"
              placeholder="Issue subject"
              className="mt-3 w-full rounded-md bg-slate-950/70 px-4 py-3"
            />
            <input
              name="department"
              placeholder="Department"
              className="mt-3 w-full rounded-md bg-slate-950/70 px-4 py-3"
            />
            <button className="mt-3 rounded-md bg-sky-300 px-4 py-2 font-bold text-slate-950">
              Draft complaint
            </button>
            {complaintDraft && (
              <p className="mt-3 whitespace-pre-wrap rounded-md bg-white/5 p-3 text-sm text-slate-200">
                {complaintDraft}
              </p>
            )}
          </form>
          <div className="glass rounded-lg p-4 sm:p-5">
            <Globe2 className="mr-2 inline text-sky-300" />
            Translation requires a configured AI provider. Voice input depends
            on browser support; use your keyboard microphone on Android.
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

function AppFrame({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  return (
    <main className="page-shell mx-auto min-h-[calc(100vh-72px)] max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
      <div className="mb-6 sm:mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300 sm:text-sm sm:tracking-[0.2em]">
          {kicker}
        </p>
        <h1 className="page-title mt-2 text-4xl font-black md:text-5xl">
          {title}
        </h1>
      </div>
      {children}
    </main>
  );
}

function App() {
  const auth = useAuth();
  return (
    <BrowserRouter>
      <Shell auth={auth}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage auth={auth} />} />
          <Route
            path="/dashboard"
            element={
              <Protected auth={auth}>
                <Dashboard auth={auth} />
              </Protected>
            }
          />
          <Route
            path="/eligibility"
            element={
              <Protected auth={auth}>
                <EligibilityPage />
              </Protected>
            }
          />
          <Route
            path="/services"
            element={
              <Protected auth={auth}>
                <ServicesPage />
              </Protected>
            }
          />
          <Route
            path="/documents"
            element={
              <Protected auth={auth}>
                <DocumentsPage />
              </Protected>
            }
          />
          <Route
            path="/assistant"
            element={
              <Protected auth={auth}>
                <AssistantPage />
              </Protected>
            }
          />
          <Route
            path="/tracking"
            element={
              <Protected auth={auth}>
                <TrackingPage />
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <Protected auth={auth}>
                {auth.user?.role === "admin" ? (
                  <AdminPage />
                ) : (
                  <Navigate to="/dashboard" replace />
                )}
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

export default App;
