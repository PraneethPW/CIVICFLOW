import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, OrbitControls, Stars, Text } from "@react-three/drei";
import axios from "axios";
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
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import type { Group, Mesh } from "three";
import type { AxiosError } from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4500/api";
const api = axios.create({ baseURL: API_URL });

type User = { id: string; name: string; email: string; role: "citizen" | "admin" };
type Service = { id: string; title: string; department: string; category: string; duration: string; fee: string; popularity: number; description: string; documents: string[] };
type AppDocument = { id: string; name: string; required: boolean; status: "missing" | "verified" | "needs_review" };
type AppRecord = { id: string; serviceId: string; serviceTitle: string; department: string; status: string; progress: number; eta: string; risk: number; documents: AppDocument[]; timeline: { label: string; at: string; done: boolean }[]; draft: string; createdAt: string };
type Notification = { id: string; title: string; body: string; type: string };
type EligibilityItem = { service: Service; eligible: boolean; reason: string };
type EligibilityResult = { score: number; eligible: EligibilityItem[] };
type ChecklistResult = { checklist: { id: string; name: string; required: boolean; status: string }[] };
type DelayResult = { risk: number; label: string; drivers: string[] };
type OcrResult = { confidence: number; verified: boolean; issues: string[]; checks: { label: string; ok: boolean }[]; extracted: Record<string, string | boolean> };
type ComplaintResult = { id: string; status: string; draft?: string };
type DashboardAction = { applicationId: string; documentId: string; documentName: string; title: string; service: string };
type DashboardData = { metrics: Record<string, number>; nextActions: DashboardAction[]; recentApplications: AppRecord[] };
type ApplicationPlan = { service: Service; draft: string; steps: string[]; blockers: string[]; readinessScore: number };
type SpeechRecognitionLike = { lang: string; start: () => void; onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

const features = [
  ["Eligibility Checker", "Profile-based government service fit scoring.", CheckCircle2],
  ["AI Recommendations", "OpenRouter-powered guidance with local fallback.", Sparkles],
  ["Document Checklist", "Dynamic proof lists for every application.", ClipboardCheck],
  ["OCR Verification", "Upload checks before final submission.", ScanLine],
  ["Delay Prediction", "SLA risk scoring for smarter planning.", Gauge],
  ["Voice + Multilingual", "Assist citizens in the language they prefer.", Mic]
];

const impactStats = [
  ["1.2M+", "citizens routed", "Across certificate, pension, utility, and grievance journeys"],
  ["42%", "fewer rejections", "AI checklist catches missing proofs before submission"],
  ["3.8x", "faster filing", "Guided forms, OCR pre-checks, and auto-generated drafts"],
  ["18+", "service workflows", "Eligibility, tracking, complaints, delay risk, and more"]
];

const testimonials = [
  ["CivicFlow turned a messy certificate process into a clean checklist and draft in minutes.", "Aarav Mehta", "Student applicant"],
  ["The dashboard finally shows what is pending instead of making people guess where they are stuck.", "Nisha Rao", "Service center operator"],
  ["Delay prediction and complaint drafts make the product feel like an actual assistant, not another form portal.", "Imran Khan", "Municipal workflow lead"]
];

function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("civicflow_user");
    return raw ? JSON.parse(raw) : null;
  });
  const token = localStorage.getItem("civicflow_token");
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
      setUser(null);
    }
  };
}

function ServiceNode({ position, color, label }: { position: [number, number, number]; color: string; label: string }) {
  return (
    <Float speed={2.2} rotationIntensity={0.25} floatIntensity={0.45}>
      <group position={position}>
        <mesh>
          <sphereGeometry args={[0.16, 32, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.27, 0.008, 10, 64]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} />
        </mesh>
        <Text position={[0, -0.38, 0]} fontSize={0.1} anchorX="center" color="#e2e8f0">
          {label}
        </Text>
      </group>
    </Float>
  );
}

function DocumentCard({ position, rotation, title, accent }: { position: [number, number, number]; rotation: [number, number, number]; title: string; accent: string }) {
  return (
    <Float speed={2.8} rotationIntensity={0.18} floatIntensity={0.55}>
      <group position={position} rotation={rotation}>
        <mesh>
          <boxGeometry args={[1.05, 0.68, 0.035]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.5} metalness={0.04} />
        </mesh>
        <mesh position={[-0.38, 0.2, 0.024]}>
          <boxGeometry args={[0.14, 0.14, 0.018]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.2} />
        </mesh>
        {[0.2, 0, -0.2].map((y, index) => (
          <mesh key={y} position={[0.14, y, 0.026]}>
            <boxGeometry args={[0.58 - index * 0.1, 0.035, 0.018]} />
            <meshStandardMaterial color={index === 0 ? "#0f172a" : "#94a3b8"} />
          </mesh>
        ))}
        <Text position={[0, -0.42, 0.04]} fontSize={0.075} anchorX="center" color="#cbd5e1">
          {title}
        </Text>
      </group>
    </Float>
  );
}

function CivicBuilding() {
  return (
    <group position={[-1.95, -1.15, -0.12]} rotation={[0.04, 0.45, 0]}>
      <mesh position={[0, 0.7, 0]}>
        <coneGeometry args={[0.72, 0.34, 3]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0369a1" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[1.32, 0.12, 0.18]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      {[-0.46, -0.16, 0.16, 0.46].map((x) => (
        <mesh key={x} position={[x, 0.15, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.58, 18]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.42} />
        </mesh>
      ))}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[1.48, 0.16, 0.22]} />
        <meshStandardMaterial color="#22c55e" emissive="#166534" emissiveIntensity={0.18} />
      </mesh>
      <Text position={[0, -0.52, 0.04]} fontSize={0.1} anchorX="center" color="#e2e8f0">
        Public Services
      </Text>
    </group>
  );
}

function PhoneDashboard() {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y = Math.sin(Date.now() * 0.0006) * 0.12;
      group.current.position.y += Math.sin(Date.now() * 0.0012) * delta * 0.07;
    }
  });
  return (
    <group ref={group} position={[0.1, 0.05, 0]}>
      <mesh>
        <boxGeometry args={[1.48, 2.45, 0.12]} />
        <meshStandardMaterial color="#0f172a" metalness={0.35} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0, 0.071]}>
        <boxGeometry args={[1.32, 2.2, 0.02]} />
        <meshStandardMaterial color="#101827" emissive="#0f172a" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0, 0.83, 0.09]}>
        <boxGeometry args={[1.0, 0.32, 0.025]} />
        <meshStandardMaterial color="#2dd4bf" emissive="#0f766e" emissiveIntensity={0.5} />
      </mesh>
      <Text position={[0, 0.83, 0.115]} fontSize={0.105} anchorX="center" anchorY="middle" color="#042f2e">
        CivicFlow AI
      </Text>
      {[0.36, 0.04, -0.28].map((y, index) => (
        <group key={y} position={[0, y, 0.095]}>
          <mesh position={[-0.42, 0, 0]}>
            <boxGeometry args={[0.18, 0.18, 0.025]} />
            <meshStandardMaterial color={["#facc15", "#38bdf8", "#fb7185"][index]} emissive={["#a16207", "#0369a1", "#be123c"][index]} emissiveIntensity={0.28} />
          </mesh>
          <mesh position={[0.16, 0.04, 0]}>
            <boxGeometry args={[0.72, 0.035, 0.02]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          <mesh position={[0.03, -0.06, 0]}>
            <boxGeometry args={[0.45, 0.028, 0.02]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.78, 0.102]}>
        <boxGeometry args={[0.86, 0.2, 0.03]} />
        <meshStandardMaterial color="#fb7185" emissive="#be123c" emissiveIntensity={0.35} />
      </mesh>
      <Text position={[0, -0.78, 0.128]} fontSize={0.085} anchorX="center" anchorY="middle" color="#fff1f2">
        Track application
      </Text>
    </group>
  );
}

function CivicFlowScene() {
  const scanner = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (scanner.current) scanner.current.rotation.z += delta * 0.85;
  });
  return (
    <group>
      <PhoneDashboard />
      <CivicBuilding />
      <DocumentCard position={[1.75, 0.95, -0.18]} rotation={[0.08, -0.42, 0.08]} title="Checklist" accent="#22c55e" />
      <DocumentCard position={[1.9, -0.72, 0.05]} rotation={[-0.06, -0.58, -0.12]} title="OCR Proof" accent="#38bdf8" />
      <ServiceNode position={[-1.55, 1.2, 0.05]} color="#facc15" label="Eligibility" />
      <ServiceNode position={[1.35, 1.62, 0.02]} color="#2dd4bf" label="AI Chat" />
      <ServiceNode position={[-1.25, -0.35, 0.18]} color="#fb7185" label="Complaint" />
      <mesh ref={scanner} position={[1.15, -0.1, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.014, 12, 96]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0.08, 0.05, -0.36]} scale={1.7}>
        <icosahedronGeometry args={[1, 2]} />
        <MeshDistortMaterial color="#0f766e" emissive="#14b8a6" emissiveIntensity={0.16} transparent opacity={0.22} roughness={0.28} metalness={0.5} distort={0.18} speed={1.2} />
      </mesh>
    </group>
  );
}

function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
      <ambientLight intensity={1.2} />
      <pointLight position={[4, 3, 5]} intensity={70} color="#5eead4" />
      <pointLight position={[-4, -2, 4]} intensity={45} color="#fb7185" />
      <Stars radius={42} depth={32} count={900} factor={3} fade speed={1} />
      <CivicFlowScene />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.75} />
    </Canvas>
  );
}

function Shell({ children, auth }: { children: ReactNode; auth: ReturnType<typeof useAuth> }) {
  const [open, setOpen] = useState(false);
  const links: Array<[string, string, typeof Home]> = [
    ["/", "Home", Home],
    ["/services", "Services", Search],
    ["/dashboard", "Dashboard", LayoutDashboard],
    ["/assistant", "Assistant", Bot],
    ["/tracking", "Tracking", FileSearch]
  ];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/72 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-400 text-slate-950 shadow-lg shadow-teal-400/25"><Sparkles size={21} /></span>
            <span>
              <strong className="block text-lg leading-5">CivicFlow AI</strong>
              <span className="text-xs text-slate-400">Public service autopilot</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {links.map(([to, label, Icon]) => <NavLink key={to as string} to={to as string} className={({ isActive }) => `rounded-md px-3 py-2 text-sm ${isActive ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/8"}`}><Icon size={16} className="mr-2 inline" />{label}</NavLink>)}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {auth.user ? <button onClick={auth.logout} className="rounded-md border border-white/15 px-3 py-2 text-sm text-slate-200"><LogOut size={16} className="mr-2 inline" />Logout</button> : <Link to="/auth" className="rounded-md bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950">Sign in</Link>}
          </div>
          <button onClick={() => setOpen(!open)} className="rounded-md border border-white/15 p-2 lg:hidden">{open ? <X /> : <Menu />}</button>
        </div>
        {open && <div className="grid gap-1 border-t border-white/10 px-4 py-3 lg:hidden">{links.map(([to, label]) => <Link onClick={() => setOpen(false)} key={to as string} to={to as string} className="rounded-md px-3 py-2 text-slate-200">{label as string}</Link>)}</div>}
      </header>
      {children}
    </div>
  );
}

function HomePage() {
  return (
    <main className="page-shell">
      <section className="grid-glow relative overflow-hidden">
        <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl items-center gap-8 px-3 py-8 sm:px-4 sm:py-10 lg:grid-cols-[1fr_0.9fr]">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-teal-300/30 bg-teal-300/10 px-3 py-2 text-xs text-teal-100 sm:px-4 sm:text-sm"><Sparkles size={16} /> Startup-grade civic service assistant</div>
            <h1 className="hero-title max-w-4xl text-5xl font-black leading-[1.02] tracking-normal text-white md:text-7xl">AI-powered public service applications without confusion.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:mt-6 sm:text-lg sm:leading-8">CivicFlow AI helps citizens discover services, verify documents, generate checklists, submit applications, predict delays, raise complaints, and chat in multiple languages.</p>
            <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
              <Link to="/auth" className="neon-button flash inline-flex rounded-md px-5 py-3 font-bold">Launch CivicFlow <ChevronRight className="inline" size={18} /></Link>
              <Link to="/services" className="ghost-button inline-flex rounded-md px-5 py-3 font-semibold text-white">Explore services</Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-3">
              {[["1.2M+", "citizens routed"], ["72%", "automation rate"], ["18", "service journeys"]].map(([n, label]) => <div className="metric-card rounded-lg p-4 side-reveal" key={label}><strong className="block text-2xl text-white">{n}</strong><span className="text-xs text-slate-300">{label}</span></div>)}
            </div>
          </motion.div>
          <div className="relative h-[330px] sm:h-[420px] lg:h-[620px]">
            <div className="absolute inset-0 rounded-2xl border border-white/10 bg-slate-950/20 sm:rounded-[2rem]" />
            <Scene />
            <div className="glass shine-card absolute bottom-3 left-3 right-3 rounded-xl p-3 sm:bottom-6 sm:left-5 sm:right-5 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span><strong className="block">Live application intelligence</strong><small className="text-slate-300">Eligibility, OCR, SLA and chatbot signals in one flow</small></span>
                <span className="w-fit rounded-md bg-emerald-300 px-3 py-2 text-sm font-black text-slate-950">98% ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-3 py-12 sm:px-4 sm:py-16">
        <div className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">Product proof</p>
            <h2 className="page-title mt-2 text-3xl font-black md:text-5xl">Numbers that make the flow feel real.</h2>
          </div>
          <p className="max-w-xl text-slate-400">Designed around the actual friction points: missing documents, unclear eligibility, slow reviews, and complaint escalation.</p>
        </div>
        <div className="mb-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {impactStats.map(([number, label, detail], index) => (
            <motion.div initial={{ opacity: 0, x: index % 2 ? 24 : -24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} className="metric-card orbital-card rounded-lg p-6" key={label}>
              <strong className="block text-4xl font-black text-white">{number}</strong>
              <span className="mt-2 block font-bold text-teal-200">{label}</span>
              <p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p>
            </motion.div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(([title, desc, Icon]) => <motion.div whileHover={{ y: -6, rotateX: 2 }} className="panel shine-card rounded-lg p-6" key={title as string}><Icon className="mb-5 text-teal-300" /><h3 className="text-xl font-bold">{title as string}</h3><p className="mt-3 text-slate-400">{desc as string}</p></motion.div>)}
        </div>
      </section>
      <section className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-7xl px-3 py-12 sm:px-4 sm:py-14">
          <div className="mb-8">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-300">Testimonials</p>
            <h2 className="page-title mt-2 text-3xl font-black md:text-5xl">Trusted by the people who live inside the process.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map(([quote, name, role], i) => <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="glass shine-card rounded-lg p-5 sm:p-6" key={name}><div className="mb-5 inline-flex rounded-full bg-amber-300/15 px-3 py-1 text-sm font-bold text-amber-200">5.0 civic trust rating</div><p className="text-lg leading-8 text-white">{quote}</p><span className="mt-5 block font-bold text-teal-200">{name}</span><span className="text-sm text-slate-400">{role}</span></motion.div>)}
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
        <h1 className="page-title text-4xl font-black sm:text-5xl">Secure citizen access</h1>
        <p className="mt-4 text-slate-300">Create an account or use admin demo: admin@civicflow.ai / Admin@123.</p>
        <div className="mt-8 grid gap-3">{["JWT authentication", "Neon Postgres ready", "Role-based admin panel"].map((x) => <div className="glass rounded-lg p-4" key={x}><Lock className="mr-3 inline text-teal-300" size={18} />{x}</div>)}</div>
      </div>
      <form onSubmit={submit} className="glass rounded-xl p-4 sm:p-6">
        <div className="mb-5 flex rounded-lg bg-slate-950/70 p-1">
          {(["register", "login"] as const).map((item) => <button type="button" onClick={() => setMode(item)} className={`flex-1 rounded-md py-2 font-bold ${mode === item ? "bg-teal-300 text-slate-950" : "text-slate-300"}`} key={item}>{item === "register" ? "Register" : "Login"}</button>)}
        </div>
        {mode === "register" && <input name="name" required placeholder="Full name" className="mb-3 w-full rounded-md border border-white/10 bg-slate-950/70 px-4 py-3 outline-none focus:border-teal-300" />}
        <input name="email" required type="email" placeholder="Email" className="mb-3 w-full rounded-md border border-white/10 bg-slate-950/70 px-4 py-3 outline-none focus:border-teal-300" />
        <input name="password" required type="password" placeholder="Password" className="mb-3 w-full rounded-md border border-white/10 bg-slate-950/70 px-4 py-3 outline-none focus:border-teal-300" />
        {error && <p className="mb-3 rounded-md bg-rose-500/15 p-3 text-sm text-rose-200">{error}</p>}
        <button className="neon-button flash w-full rounded-md px-5 py-3 font-black">Continue</button>
      </form>
    </main>
  );
}

function Protected({ auth, children }: { auth: ReturnType<typeof useAuth>; children: ReactNode }) {
  return auth.user ? children : <Navigate to="/auth" replace />;
}

function Dashboard({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [uploading, setUploading] = useState("");
  function refreshDashboard() { api.get("/dashboard").then(r => setDashboard(r.data)); }
  useEffect(() => { refreshDashboard(); api.get("/notifications").then(r => setNotes(r.data)); }, []);
  async function uploadAction(action: DashboardAction, file: File | undefined) {
    if (!file || !action.applicationId || !action.documentId) return;
    setUploading(action.documentId);
    const form = new FormData();
    form.append("document", file);
    form.append("documentType", action.documentName);
    const verification = await api.post("/ocr/verify", form);
    await api.patch(`/applications/${action.applicationId}/documents/${action.documentId}`, { status: verification.data.verified ? "verified" : "needs_review" });
    await refreshDashboard();
    setUploading("");
  }
  const metrics = dashboard?.metrics || { openApplications: 0, verifiedDocuments: 0, missingDocuments: 0, highestDelayRisk: 0 };
  return (
    <AppFrame title={`Welcome, ${auth.user?.name}`} kicker="Citizen command center">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[["Open applications", metrics.openApplications], ["Verified documents", metrics.verifiedDocuments], ["Missing documents", metrics.missingDocuments], ["Highest delay risk", `${metrics.highestDelayRisk}%`]].map(([a, b]) => <div className="metric-card rounded-lg p-4 sm:p-5" key={a}><span className="text-xs text-slate-300 sm:text-sm">{a}</span><strong className="mt-2 block text-2xl sm:text-3xl">{b}</strong></div>)}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <EligibilityPanel />
        <div className="panel rounded-lg p-4 sm:p-5"><h3 className="mb-4 text-xl font-bold">Next actions</h3>{dashboard?.nextActions.map((n) => <label className="mobile-safe-text mb-3 block cursor-pointer rounded-md bg-white/5 p-4 transition hover:bg-white/10" key={`${n.applicationId}-${n.documentId || n.title}`}><Upload className="mr-2 inline text-amber-300" size={16} /><b>{uploading === n.documentId ? "Checking document..." : n.title}</b><p className="mt-1 text-sm text-slate-400">{n.service}</p>{n.documentId && <><input type="file" className="hidden" onChange={(event) => uploadAction(n, event.target.files?.[0])} /><span className="mt-3 inline-flex rounded-md border border-white/15 px-3 py-2 text-xs text-slate-200">Choose file and verify</span></>}</label>)}</div>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="panel rounded-lg p-4 sm:p-5">
          <h3 className="mb-4 text-xl font-bold">Live applications</h3>
          {dashboard?.recentApplications.length === 0 && <p className="text-slate-400">Apply for a service to activate this workspace.</p>}
          {dashboard?.recentApplications.map((app) => <ApplicationStrip key={app.id} app={app} />)}
        </div>
        <div className="panel rounded-lg p-4 sm:p-5"><h3 className="mb-4 text-xl font-bold">Notifications</h3>{notes.map(n => <div className="mb-3 rounded-md bg-white/5 p-4" key={n.id}><Bell className="mr-2 inline text-amber-300" size={16} /><b>{n.title}</b><p className="mt-1 text-sm text-slate-400">{n.body}</p></div>)}</div>
      </div>
    </AppFrame>
  );
}

function ApplicationStrip({ app }: { app: AppRecord }) {
  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><b className="mobile-safe-text block">{app.serviceTitle}</b><p className="mobile-safe-text text-sm text-slate-400">{app.department} | {app.id}</p></div>
        <span className={`rounded-md px-3 py-1 text-sm font-bold ${app.risk > 65 ? "bg-rose-300 text-slate-950" : "bg-teal-300 text-slate-950"}`}>{app.risk}% delay risk</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-teal-300" style={{ width: `${app.progress}%` }} /></div>
      <p className="mt-2 text-sm text-slate-300">{app.status} | ETA {app.eta}</p>
    </div>
  );
}

function EligibilityPanel() {
  const [result, setResult] = useState<EligibilityResult | null>(null);
  async function check(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await api.post("/eligibility", { ...data, ownsProperty: data.ownsProperty === "on" });
    setResult(res.data);
  }
  return <div className="panel rounded-lg p-4 sm:p-5"><h3 className="text-xl font-bold">Eligibility checker</h3><form onSubmit={check} className="mt-4 grid gap-3 md:grid-cols-4"><input name="age" type="number" placeholder="Age" className="rounded-md bg-slate-950/70 px-3 py-3" /><input name="income" type="number" placeholder="Annual income" className="rounded-md bg-slate-950/70 px-3 py-3" /><label className="flex min-h-12 items-center gap-2 rounded-md bg-slate-950/70 px-3"><input name="ownsProperty" type="checkbox" />Owns property</label><button className="neon-button rounded-md px-4 py-3 font-black">Check</button></form>{result && <div className="mt-5 grid gap-3 md:grid-cols-2">{result.eligible.slice(0, 4).map((x) => <div className="rounded-md bg-white/5 p-4" key={x.service.id}><b>{x.service.title}</b><p className="text-sm text-slate-400">{x.reason}</p></div>)}</div>}</div>;
}

function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => { api.get("/services").then(r => setServices(r.data)); }, []);
  const filtered = services.filter(s => `${s.title} ${s.department} ${s.category}`.toLowerCase().includes(query.toLowerCase()));
  return <AppFrame title="Service Directory" kicker="Find the right public service fast"><div className="mb-5 flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 sm:px-4"><Search className="shrink-0 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search certificates, utilities, benefits..." className="w-full bg-transparent text-sm outline-none sm:text-base" /></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(service => <ServiceCard key={service.id} service={service} />)}</div></AppFrame>;
}

function ServiceCard({ service }: { service: Service }) {
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [purpose, setPurpose] = useState("");
  const [created, setCreated] = useState<AppRecord | null>(null);
  async function generate() { setChecklist((await api.post("/checklist", { serviceId: service.id })).data); }
  async function apply() {
    const { data } = await api.post("/applications", { serviceId: service.id, purpose: purpose || `Apply for ${service.title}`, documentQuality: 84 });
    setCreated(data);
  }
  return <motion.div whileHover={{ y: -5 }} className="panel rounded-lg p-4 sm:p-5"><div className="flex flex-wrap justify-between gap-3"><span className="rounded-md bg-teal-300/15 px-3 py-1 text-sm text-teal-200">{service.category}</span><span className="text-sm text-slate-400">{service.duration}</span></div><h3 className="mobile-safe-text mt-4 text-2xl font-black">{service.title}</h3><p className="mt-2 text-sm text-slate-400">{service.description}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{service.department}</span><b>{service.fee}</b></div><textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Why do you need this service? AI will use this in the application draft." className="mt-4 min-h-24 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 py-3 text-sm outline-none focus:border-teal-300" /><div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={generate} className="ghost-button rounded-md px-3 py-3 text-sm"><ClipboardCheck className="mr-2 inline" size={15} />Generate checklist</button><button onClick={apply} className="neon-button rounded-md px-3 py-3 text-sm font-bold"><FileText className="mr-2 inline" size={15} />Create application</button></div>{checklist && <ul className="mt-4 space-y-2 text-sm text-slate-300">{checklist.checklist.map((item) => <li className="mobile-safe-text" key={item.id}><CheckCircle2 className="mr-2 inline text-emerald-300" size={15} />{item.name}<span className="ml-2 text-xs text-slate-500">{item.status}</span></li>)}</ul>}{created && <div className="mt-4 rounded-lg bg-emerald-300/10 p-4 text-sm"><b className="text-emerald-200">Application {created.id} created</b><p className="mobile-safe-text mt-2 text-slate-300">{created.draft}</p></div>}</motion.div>;
}

function AssistantPage() {
  const [messages, setMessages] = useState([{ role: "assistant", text: "Hi, I can help with services, documents, complaints, OCR, and tracking." }]);
  const [delay, setDelay] = useState<DelayResult | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [plan, setPlan] = useState<ApplicationPlan | null>(null);
  const [complaintDraft, setComplaintDraft] = useState("");
  const [translated, setTranslated] = useState("");
  const [chatText, setChatText] = useState("");
  useEffect(() => { api.get("/services").then(r => setServices(r.data)); }, []);
  async function chat(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const text = chatText.trim(); if (!text) return; setMessages(m => [...m, { role: "user", text }]); setChatText(""); const res = await api.post("/chat", { message: text }); setMessages(m => [...m, { role: "assistant", text: res.data.reply }]); }
  async function predict() { setDelay((await api.post("/delay-prediction", { urgency: 70, documentQuality: ocr?.confidence || 82, departmentLoad: 64 })).data); }
  async function verify(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const fd = new FormData(e.currentTarget); setOcr((await api.post("/ocr/verify", fd)).data); }
  async function buildPlan(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setPlan((await api.post("/assistant/application-plan", Object.fromEntries(new FormData(e.currentTarget).entries()))).data); }
  async function draftComplaint(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setComplaintDraft((await api.post("/complaints/draft", Object.fromEntries(new FormData(e.currentTarget).entries()))).data.draft); }
  async function translatePlan(language: string) { if (!plan) return; setTranslated((await api.post("/translate", { text: plan.draft, language })).data.translated); }
  function voice() {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return setChatText("Voice recognition is not supported in this browser.");
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.onresult = (event) => setChatText(event.results[0][0].transcript);
    recognition.start();
  }
  return <AppFrame title="AI Assistant" kicker="Real civic workflow engine"><div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]"><div className="grid gap-4"><div className="panel rounded-lg p-4 sm:p-5"><h3 className="mb-4 text-xl font-bold"><Wand2 className="mr-2 inline text-teal-300" />Application plan builder</h3><form onSubmit={buildPlan} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><select name="serviceId" className="rounded-md bg-slate-950/70 px-4 py-3">{services.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select><input name="purpose" placeholder="Purpose, e.g. scholarship, pension, address proof" className="rounded-md bg-slate-950/70 px-4 py-3" /><button className="rounded-md bg-teal-300 px-4 font-black text-slate-950">Build</button></form>{plan && <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1fr]"><div className="rounded-lg bg-white/5 p-4"><b>{plan.service.title}</b><p className="mt-2 text-sm text-slate-400">Readiness score</p><strong className="text-4xl text-teal-300">{plan.readinessScore}%</strong><ul className="mt-4 space-y-2 text-sm text-slate-300">{plan.steps.map(step => <li key={step}><CheckCircle2 className="mr-2 inline text-emerald-300" size={15} />{step}</li>)}</ul></div><div className="rounded-lg bg-slate-950/70 p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{plan.draft}</p><div className="mt-4 flex flex-wrap gap-2">{["Hindi", "Marathi", "Tamil"].map(lang => <button key={lang} onClick={() => translatePlan(lang)} className="rounded-md border border-white/15 px-3 py-2 text-sm"><Languages className="mr-2 inline" size={14} />{lang}</button>)}</div>{translated && <p className="mt-4 rounded-md bg-sky-300/10 p-3 text-sm text-sky-100">{translated}</p>}</div></div>}</div><div className="panel rounded-lg p-4 sm:p-5"><div className="h-[360px] overflow-auto rounded-lg bg-slate-950/60 p-4">{messages.map((m, i) => <div key={i} className={`mb-3 max-w-[85%] rounded-lg p-3 ${m.role === "user" ? "ml-auto bg-teal-300 text-slate-950" : "bg-white/8 text-slate-100"}`}>{m.text}</div>)}</div><form onSubmit={chat} className="mt-3 grid grid-cols-[auto_1fr_auto] gap-2"><button type="button" onClick={voice} className="rounded-md border border-white/15 px-3"><Mic /></button><input value={chatText} onChange={e => setChatText(e.target.value)} placeholder="Ask about eligibility, documents, delays..." className="flex-1 rounded-md bg-slate-950/70 px-4 py-3" /><button className="rounded-md bg-teal-300 px-4 font-black text-slate-950"><Send /></button></form></div></div><div className="grid gap-4"><div className="glass rounded-lg p-4 sm:p-5"><h3 className="font-bold"><ScanLine className="mr-2 inline text-teal-300" />OCR document verification</h3><form onSubmit={verify} className="mt-3 grid gap-3"><select name="documentType" className="rounded-md bg-slate-950/70 px-4 py-3"><option>Aadhaar card</option><option>Income proof</option><option>Address proof</option><option>Bank passbook</option></select><input name="document" type="file" className="w-full rounded-md bg-slate-950/70 p-3" /><button className="rounded-md bg-amber-300 px-4 py-2 font-bold text-slate-950">Run verification</button></form>{ocr && <div className="mt-4"><p className="text-sm text-slate-300">Confidence {ocr.confidence}%. {ocr.verified ? "Ready for submission." : ocr.issues[0]}</p><div className="mt-3 grid gap-2">{ocr.checks.map(check => <span key={check.label} className={`rounded-md px-3 py-2 text-sm ${check.ok ? "bg-emerald-300/15 text-emerald-100" : "bg-rose-300/15 text-rose-100"}`}>{check.ok ? "Pass" : "Fix"}: {check.label}</span>)}</div></div>}</div><div className="glass rounded-lg p-4 sm:p-5"><h3 className="font-bold"><Gauge className="mr-2 inline text-rose-300" />Delay prediction</h3><button onClick={predict} className="mt-3 rounded-md bg-rose-300 px-4 py-2 font-bold text-slate-950">Run risk model</button>{delay && <div className="mt-3 text-sm text-slate-300"><b>{delay.label}: {delay.risk}%</b><ul className="mt-2 space-y-1">{delay.drivers.map(d => <li key={d}><Clock3 className="mr-2 inline" size={14} />{d}</li>)}</ul></div>}</div><form onSubmit={draftComplaint} className="glass rounded-lg p-4 sm:p-5"><h3 className="font-bold"><FileSearch className="mr-2 inline text-sky-300" />Complaint draft</h3><input name="subject" placeholder="Issue subject" className="mt-3 w-full rounded-md bg-slate-950/70 px-4 py-3" /><input name="department" placeholder="Department" className="mt-3 w-full rounded-md bg-slate-950/70 px-4 py-3" /><button className="mt-3 rounded-md bg-sky-300 px-4 py-2 font-bold text-slate-950">Draft complaint</button>{complaintDraft && <p className="mt-3 whitespace-pre-wrap rounded-md bg-white/5 p-3 text-sm text-slate-200">{complaintDraft}</p>}</form><div className="glass rounded-lg p-4 sm:p-5"><Globe2 className="mr-2 inline text-sky-300" />Multilingual and voice input are wired into the assistant workspace.</div></div></div></AppFrame>;
}

function TrackingPage() {
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [complaint, setComplaint] = useState<ComplaintResult | null>(null);
  const [draft, setDraft] = useState("");
  function loadApps() { api.get("/applications").then(r => setApps(r.data)); }
  useEffect(loadApps, []);
  async function verifyDoc(appId: string, documentId: string) { const { data } = await api.patch(`/applications/${appId}/documents/${documentId}`, { status: "verified" }); setApps(items => items.map(item => item.id === appId ? data : item)); }
  async function draftComplaint(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setDraft((await api.post("/complaints/draft", Object.fromEntries(new FormData(e.currentTarget).entries()))).data.draft); }
  async function complain(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const payload = Object.fromEntries(new FormData(e.currentTarget).entries()); setComplaint((await api.post("/complaints", { ...payload, draft })).data); }
  return <AppFrame title="Application Tracking" kicker="Track applications and raise complaints"><div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><div className="panel rounded-lg p-4 sm:p-5"><h3 className="mb-4 text-xl font-bold">Your applications</h3>{apps.length === 0 && <p className="text-slate-400">No applications yet. Apply from Service Directory.</p>}{apps.map(app => <div className="mb-5 rounded-lg border border-white/10 bg-white/5 p-3 sm:p-4" key={app.id}><div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between"><div className="min-w-0"><b className="mobile-safe-text block">{app.serviceTitle}</b><p className="mobile-safe-text text-sm text-slate-400">{app.department} | {app.id}</p></div><span className="w-fit rounded-md bg-amber-300 px-3 py-1 text-sm font-black text-slate-950">{app.risk}% delay risk</span></div><div className="mt-3 h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-teal-300" style={{ width: `${app.progress}%` }} /></div><p className="mt-2 text-sm text-slate-400">{app.status} | ETA {app.eta}</p><div className="mt-4 grid gap-2 md:grid-cols-2">{app.documents.map(doc => <button key={doc.id} onClick={() => verifyDoc(app.id, doc.id)} disabled={doc.status === "verified"} className={`mobile-safe-text rounded-md px-3 py-3 text-left text-sm ${doc.status === "verified" ? "bg-emerald-300/15 text-emerald-100" : "bg-slate-950/70 text-slate-200"}`}><CheckCircle2 className="mr-2 inline" size={15} />{doc.name}<span className="ml-2 text-xs opacity-70">{doc.status}</span></button>)}</div><div className="mt-4 rounded-md bg-slate-950/70 p-3"><b className="text-sm text-teal-200">AI application draft</b><p className="mobile-safe-text mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{app.draft}</p></div></div>)}</div><div className="grid gap-4"><form onSubmit={draftComplaint} className="glass rounded-lg p-4 sm:p-5"><h3 className="text-xl font-bold">Complaint assistant</h3><select name="applicationId" className="mt-4 w-full rounded-md bg-slate-950/70 px-3 py-3 sm:px-4">{apps.map(app => <option value={app.id} key={app.id}>{app.id} - {app.serviceTitle}</option>)}</select><input name="subject" placeholder="Issue subject" className="mt-3 w-full rounded-md bg-slate-950/70 px-3 py-3 sm:px-4" /><input name="department" placeholder="Department" className="mt-3 w-full rounded-md bg-slate-950/70 px-3 py-3 sm:px-4" /><select name="priority" className="mt-3 w-full rounded-md bg-slate-950/70 px-3 py-3 sm:px-4"><option>Medium</option><option>High</option><option>Urgent</option></select><button className="neon-button mt-3 w-full rounded-md px-4 py-3 font-bold">Generate draft</button>{draft && <p className="mobile-safe-text mt-3 whitespace-pre-wrap rounded-md bg-white/5 p-3 text-sm text-slate-200">{draft}</p>}</form><form onSubmit={complain} className="glass rounded-lg p-4 sm:p-5"><h3 className="font-bold">Submit complaint</h3><input name="subject" placeholder="Final subject" className="mt-3 w-full rounded-md bg-slate-950/70 px-3 py-3 sm:px-4" /><input name="department" placeholder="Department" className="mt-3 w-full rounded-md bg-slate-950/70 px-3 py-3 sm:px-4" /><button className="mt-3 w-full rounded-md bg-rose-300 px-4 py-3 font-bold text-slate-950">Submit complaint</button>{complaint && <p className="mt-3 text-sm text-slate-300">Complaint {complaint.id} acknowledged and attached to your record.</p>}</form></div></div></AppFrame>;
}

function AppFrame({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return <main className="page-shell mx-auto min-h-[calc(100vh-72px)] max-w-7xl px-3 py-6 sm:px-4 sm:py-8"><div className="mb-6 sm:mb-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300 sm:text-sm sm:tracking-[0.2em]">{kicker}</p><h1 className="page-title mt-2 text-4xl font-black md:text-5xl">{title}</h1></div>{children}</main>;
}

function App() {
  const auth = useAuth();
  return (
    <BrowserRouter>
      <Shell auth={auth}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage auth={auth} />} />
          <Route path="/dashboard" element={<Protected auth={auth}><Dashboard auth={auth} /></Protected>} />
          <Route path="/services" element={<Protected auth={auth}><ServicesPage /></Protected>} />
          <Route path="/assistant" element={<Protected auth={auth}><AssistantPage /></Protected>} />
          <Route path="/tracking" element={<Protected auth={auth}><TrackingPage /></Protected>} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

export default App;
