import { useState } from "react";
import type { FormEvent } from "react";
import { api, downloadDocument, run } from "./api";
import { useLiveRefresh } from "./live";
import type { Application, Complaint } from "./models";

function Timeline({ application }: { application: Application }) {
  return (
    <ol className="my-4 grid gap-2 text-sm sm:grid-cols-3">
      {application.timeline.map((step) => (
        <li
          key={step.label}
          className={step.done ? "text-teal-200" : "text-slate-500"}
        >
          {step.done ? "✓" : "○"} {step.label}
          {step.at && (
            <small className="block">
              {new Date(step.at).toLocaleString()}
            </small>
          )}
        </li>
      ))}
    </ol>
  );
}
function ComplaintList({ complaints }: { complaints: Complaint[] }) {
  return (
    <div className="grid gap-3">
      {complaints.length === 0 && (
        <p className="text-slate-400">No complaints yet.</p>
      )}
      {complaints.map((item) => (
        <article
          className="rounded-lg border border-white/10 p-4"
          key={item.id}
        >
          <strong>{item.subject}</strong>
          <p className="mobile-safe-text text-sm text-slate-400">
            {item.id} · {item.status}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {item.department} · {item.priority}
            {item.applicationId && (
              <span className="mobile-safe-text block">
                Application: {item.applicationId}
              </span>
            )}
          </p>
          {item.draft && (
            <p className="my-3 whitespace-pre-wrap text-sm text-slate-200">
              {item.draft}
            </p>
          )}
          {item.response && (
            <p className="mt-2 whitespace-pre-wrap text-teal-100">
              Officer response: {item.response}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
export function TrackingPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  useLiveRefresh(async () => {
    const [apps, items] = await Promise.all([
      api.get("/applications"),
      api.get("/complaints"),
    ]);
    setApplications(apps.data);
    setComplaints(items.data);
  });
  async function upload(app: Application, documentId: string, file?: File) {
    if (!file) return;
    setBusy(documentId);
    setMessage("");
    try {
      const form = new FormData();
      form.append("document", file);
      const { data } = await api.post(
        `/applications/${app.id}/documents/${documentId}/upload`,
        form,
      );
      setApplications((items) =>
        items.map((item) => (item.id === app.id ? data.application : item)),
      );
      setMessage(data.ocr.issues.join(" "));
    } finally {
      setBusy("");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>, draftOnly: boolean) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    setBusy("complaint");
    try {
      if (draftOnly)
        setDraft((await api.post("/complaints/draft", payload)).data.draft);
      else {
        const { data } = await api.post("/complaints", {
          ...payload,
          applicationId: payload.applicationId || undefined,
          draft,
        });
        setComplaints((items) => [data, ...items]);
        setDraft("");
        form.reset();
        setMessage(
          "Complaint acknowledged. You will receive live updates here.",
        );
      }
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="page-shell mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-2 text-4xl font-black">Application tracking</h1>
      <p className="mb-6 text-slate-400">
        Status and officer responses update automatically. Requests are tracked
        inside CivicFlow.
      </p>
      {message && (
        <p role="status" className="mb-4 rounded-lg bg-teal-300/10 p-4">
          {message}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <section className="grid content-start gap-4">
          {applications.length === 0 && (
            <p>No applications yet. Create one from Services.</p>
          )}
          {applications.map((app) => (
            <article key={app.id} className="panel rounded-xl p-5">
              <h2 className="text-xl font-bold">{app.serviceTitle}</h2>
              <p className="mobile-safe-text text-sm text-slate-400">
                {app.id}
              </p>
              <p className="my-3 font-bold text-teal-200">
                {app.status} · {app.progress}%
              </p>
              <div className="h-2 rounded bg-slate-800">
                <div
                  className="h-2 rounded bg-teal-300"
                  style={{ width: `${app.progress}%` }}
                />
              </div>
              <Timeline application={app} />
              <div className="grid gap-3">
                {app.documents.map((doc) => (
                  <div key={doc.id} className="rounded-lg bg-white/5 p-3">
                    <b>{doc.name}</b>
                    <p className="mb-2 text-sm text-slate-400">
                      {doc.status.replaceAll("_", " ")}{" "}
                      {doc.fileName && `· ${doc.fileName}`}
                    </p>
                    {!["Approved", "Rejected"].includes(app.status) && (
                      <label className="block text-sm">
                        {busy === doc.id
                          ? "Scanning and uploading…"
                          : "Upload PNG, JPEG, or PDF (up to 8 MB)"}
                        <input
                          aria-label={`Upload ${doc.name}`}
                          type="file"
                          accept="image/png,image/jpeg,application/pdf"
                          disabled={!!busy}
                          className="mt-2 block w-full"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void run(() => upload(app, doc.id, file));
                          }}
                        />
                      </label>
                    )}
                    {doc.fileId && (
                      <button
                        onClick={() =>
                          void run(() =>
                            downloadDocument(
                              doc.fileId!,
                              doc.fileName || doc.name,
                            ),
                          )
                        }
                        className="mt-2 rounded border border-white/20 px-3 py-2 text-sm"
                      >
                        Download / share file
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <details className="mt-4">
                <summary>Application draft</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">
                  {app.draft}
                </p>
              </details>
            </article>
          ))}
        </section>
        <section className="grid content-start gap-5">
          <form
            onSubmit={(event) => void run(() => submit(event, false))}
            className="glass rounded-xl p-5"
          >
            <h2 className="mb-4 text-xl font-bold">Raise a complaint</h2>
            <select
              name="applicationId"
              aria-label="Related application"
              className="mb-3 w-full rounded bg-slate-950 p-3"
            >
              <option value="">General complaint</option>
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.serviceTitle} · {app.id}
                </option>
              ))}
            </select>
            <input
              name="subject"
              aria-label="Complaint subject"
              required
              minLength={3}
              maxLength={200}
              placeholder="Subject"
              className="mb-3 w-full rounded bg-slate-950 p-3"
            />
            <input
              name="department"
              aria-label="Department"
              required
              minLength={2}
              placeholder="Department"
              className="mb-3 w-full rounded bg-slate-950 p-3"
            />
            <select
              name="priority"
              aria-label="Priority"
              className="mb-3 w-full rounded bg-slate-950 p-3"
            >
              <option>Medium</option>
              <option>High</option>
              <option>Urgent</option>
            </select>
            <textarea
              aria-label="Complaint details"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={10000}
              placeholder="Describe the issue or generate a draft"
              className="min-h-32 w-full rounded bg-slate-950 p-3"
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                disabled={!!busy}
                type="button"
                onClick={(event) => {
                  const form = event.currentTarget.form!;
                  if (form.reportValidity())
                    void run(async () => {
                      setBusy("complaint");
                      try {
                        setDraft(
                          (
                            await api.post(
                              "/complaints/draft",
                              Object.fromEntries(new FormData(form).entries()),
                            )
                          ).data.draft,
                        );
                      } finally {
                        setBusy("");
                      }
                    });
                }}
                className="rounded border border-white/20 px-4 py-3"
              >
                Generate draft
              </button>
              <button
                disabled={!!busy}
                className="neon-button rounded px-4 py-3"
              >
                {busy === "complaint" ? "Please wait…" : "Submit complaint"}
              </button>
            </div>
          </form>
          <section className="panel rounded-xl p-5">
            <h2 className="mb-4 text-xl font-bold">Your complaints</h2>
            <ComplaintList complaints={complaints} />
          </section>
        </section>
      </div>
    </main>
  );
}

type Overview = {
  metrics: Record<string, number>;
  queues: { department: string; pending: number }[];
  applications: Application[];
  complaints: Complaint[];
};
export function AdminPage() {
  const [overview, setOverview] = useState<Overview>();
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("");
  async function refresh() {
    setOverview((await api.get("/admin/overview")).data);
  }
  useLiveRefresh(refresh);
  async function change(action: () => Promise<unknown>, key: string) {
    setBusy(key);
    try {
      await action();
      await refresh();
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="page-shell mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-4xl font-black">Officer workspace</h1>
      <p className="mb-6 mt-2 text-slate-400">
        Review actual uploads and publish updates to citizens in real time.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(overview?.metrics || {}).map(([name, count]) => (
          <div key={name} className="metric-card rounded-xl p-4">
            <span>{name.replace(/([A-Z])/g, " $1")}</span>
            <strong className="block text-3xl">{count}</strong>
          </div>
        ))}
      </div>
      <input
        aria-label="Search queue"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Search applications, IDs, departments"
        className="mb-4 w-full rounded bg-slate-950 p-3"
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-2xl font-bold">Application queue</h2>
          {overview?.applications.length === 0 && (
            <p>No applications to review.</p>
          )}
          {overview?.applications
            .filter((app) =>
              `${app.id} ${app.serviceTitle} ${app.department}`
                .toLowerCase()
                .includes(filter.toLowerCase()),
            )
            .map((app) => (
              <article key={app.id} className="panel mb-4 rounded-xl p-5">
                <h3 className="font-bold">{app.serviceTitle}</h3>
                <p className="mobile-safe-text text-sm text-slate-400">
                  {app.id} · {app.status}
                </p>
                <Timeline application={app} />
                {app.documents.map((doc) => (
                  <div key={doc.id} className="mb-3 rounded bg-white/5 p-3">
                    <strong>{doc.name}</strong>
                    <p className="text-sm text-slate-400">
                      {doc.status.replaceAll("_", " ")}{" "}
                      {doc.ocrConfidence !== undefined &&
                        `· OCR ${doc.ocrConfidence}%`}
                    </p>
                    {doc.fileId && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="rounded border border-white/20 p-2"
                          onClick={() =>
                            void run(() =>
                              downloadDocument(
                                doc.fileId!,
                                doc.fileName || doc.name,
                              ),
                            )
                          }
                        >
                          Review file
                        </button>
                        {!["Approved", "Rejected"].includes(app.status) && (
                          <>
                            <button
                              disabled={!!busy || doc.status === "verified"}
                              className="rounded bg-teal-300 p-2 text-slate-950"
                              onClick={() =>
                                void run(() =>
                                  change(
                                    () =>
                                      api.patch(
                                        `/applications/${app.id}/documents/${doc.id}`,
                                        {
                                          status: "verified",
                                          version: app.version || 0,
                                        },
                                      ),
                                    doc.id,
                                  ),
                                )
                              }
                            >
                              Verify
                            </button>
                            <button
                              disabled={!!busy || doc.status === "needs_review"}
                              className="rounded border border-white/20 p-2"
                              onClick={() =>
                                void run(() =>
                                  change(
                                    () =>
                                      api.patch(
                                        `/applications/${app.id}/documents/${doc.id}`,
                                        {
                                          status: "needs_review",
                                          version: app.version || 0,
                                        },
                                      ),
                                    doc.id,
                                  ),
                                )
                              }
                            >
                              Request review
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {!["Approved", "Rejected"].includes(app.status) && (
                  <select
                    aria-label={`Update status ${app.id}`}
                    disabled={!!busy}
                    value=""
                    className="mt-3 w-full rounded bg-slate-950 p-3"
                    onChange={(event) => {
                      const status = event.target.value;
                      if (status)
                        void run(() =>
                          change(
                            () =>
                              api.patch(
                                `/admin/applications/${app.id}/status`,
                                { status, version: app.version || 0 },
                              ),
                            app.id,
                          ),
                        );
                    }}
                  >
                    <option value="">Move to next status…</option>
                    {(app.status === "Officer review"
                      ? ["Payment/appointment", "Approved", "Rejected"]
                      : app.status === "Payment/appointment"
                        ? ["Approved", "Rejected"]
                        : ["Officer review", "Rejected"]
                    ).map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                )}
              </article>
            ))}
        </section>
        <section>
          <h2 className="mb-4 text-2xl font-bold">Complaints</h2>
          {overview?.complaints.map((item) => (
            <article key={item.id} className="panel mb-4 rounded-xl p-5">
              <ComplaintList complaints={[item]} />
              {item.status !== "Resolved" && (
                <form
                  className="mt-3 grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const payload = Object.fromEntries(
                      new FormData(event.currentTarget).entries(),
                    );
                    void run(() =>
                      change(
                        () =>
                          api.patch(`/admin/complaints/${item.id}`, {
                            ...payload,
                            version: item.version || 0,
                          }),
                        item.id,
                      ),
                    );
                  }}
                >
                  <textarea
                    name="response"
                    aria-label={`Response to ${item.subject}`}
                    required
                    minLength={3}
                    maxLength={2000}
                    placeholder="Officer response"
                    className="rounded bg-slate-950 p-3"
                  />
                  <select
                    name="status"
                    aria-label="Complaint status"
                    className="rounded bg-slate-950 p-3"
                  >
                    <option>In progress</option>
                    <option>Resolved</option>
                  </select>
                  <button disabled={!!busy} className="neon-button rounded p-3">
                    Publish response
                  </button>
                </form>
              )}
            </article>
          ))}
          <div className="panel rounded-xl p-5">
            <h2 className="mb-3 text-xl font-bold">Department queues</h2>
            {overview?.queues.map((queue) => (
              <p
                key={queue.department}
                className="mb-2 flex justify-between gap-3"
              >
                <span>{queue.department}</span>
                <b>{queue.pending}</b>
              </p>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
