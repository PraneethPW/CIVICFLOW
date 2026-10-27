import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import net from "node:net";

// Exercise real HTTP, JWT, multipart, event streams, persisted records and restart.
test(
  "citizen → document review → approval → complaint → restart",
  { timeout: 60000 },
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), "civicflow-test-"));
    const reservation = net.createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const url = `http://127.0.0.1:${port}/api`;
    const adminPassword = "test-admin-password-123";
    let server;
    let databaseUrl = "";
    let testPool;
    let testSchema;
    if (process.env.TEST_DATABASE_URL) {
      const { Pool } = await import("pg");
      testPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      testSchema = `civicflow_test_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      await testPool.query(`CREATE SCHEMA ${testSchema}`);
      const connection = new URL(process.env.TEST_DATABASE_URL);
      connection.searchParams.set("options", `-c search_path=${testSchema}`);
      databaseUrl = connection.href;
    }
    async function start() {
      server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
        cwd: resolve("."),
        env: {
          ...process.env,
          PORT: String(port),
          JWT_SECRET: "integration-only-secret-32-characters-long",
          DATABASE_URL: databaseUrl,
          DATA_DIR: dataDir,
          UPLOAD_DIR: join(dataDir, "uploads"),
          ADMIN_EMAIL: "officer@example.test",
          ADMIN_PASSWORD: adminPassword,
          OPENROUTER_API_KEY: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let logs = "";
      server.stdout.on("data", (data) => (logs += data));
      server.stderr.on("data", (data) => (logs += data));
      for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null) throw new Error(logs);
        try {
          if ((await fetch(`${url}/health`)).ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Server did not start: ${logs}`);
    }
    async function stop() {
      if (!server || server.exitCode !== null) return;
      server.kill("SIGTERM");
      await once(server, "exit");
    }
    t.after(async () => {
      await stop();
      await rm(dataDir, { recursive: true, force: true });
      if (testPool) {
        await testPool.query(`DROP SCHEMA ${testSchema} CASCADE`);
        await testPool.end();
      }
    });
    await start();
    async function request(
      path,
      { method = "GET", body, token, status = 200 } = {},
    ) {
      const response = await fetch(url + path, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body && !(body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body:
          body instanceof FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
      });
      const result = await response.json();
      assert.equal(
        response.status,
        status,
        `${method} ${path}: ${JSON.stringify(result)}`,
      );
      return result;
    }
    const citizen = await request("/auth/register", {
      method: "POST",
      body: {
        name: "Citizen One",
        email: "citizen@example.test",
        password: "citizen-password",
      },
    });
    const other = await request("/auth/register", {
      method: "POST",
      body: {
        name: "Citizen Two",
        email: "other@example.test",
        password: "citizen-password",
      },
    });
    const admin = await request("/auth/login", {
      method: "POST",
      body: { email: "officer@example.test", password: adminPassword },
    });
    await t.test("validation and role enforcement", async () => {
      await request("/auth/register", {
        method: "POST",
        body: { name: "x" },
        status: 400,
      });
      await request("/admin/overview", { token: citizen.token, status: 403 });
      await request("/events", { status: 401 });
      await request("/translate", {
        method: "POST",
        token: citizen.token,
        body: { text: "hello", language: "Hindi" },
        status: 503,
      });
    });
    const controller = new AbortController();
    const stream = await fetch(url + "/events", {
      headers: { Authorization: `Bearer ${citizen.token}` },
      signal: controller.signal,
    });
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    assert.match(decoder.decode((await reader.read()).value), /connected/);
    let application;
    await t.test(
      "creation persists and sends a live invalidation",
      async () => {
        application = await request("/applications", {
          method: "POST",
          token: citizen.token,
          body: { serviceId: "income-certificate", purpose: "Scholarship" },
        });
        assert.equal(
          application.documents.every((doc) => doc.status === "missing"),
          true,
        );
        const event = await Promise.race([
          reader.read(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("No live event")), 3000).unref(),
          ),
        ]);
        assert.match(decoder.decode(event.value), /applications/);
        assert.equal(
          (await request("/admin/overview", { token: admin.token })).metrics
            .applications,
          1,
        );
      },
    );
    controller.abort();
    await t.test(
      "private records and officer verification enforcement",
      async () => {
        await request(`/applications/${application.id}`, {
          token: other.token,
          status: 404,
        });
        await request(
          `/applications/${application.id}/documents/${application.documents[0].id}`,
          {
            method: "PATCH",
            token: citizen.token,
            body: { status: "verified", version: 0 },
            status: 403,
          },
        );
        await request(`/admin/applications/${application.id}/status`, {
          method: "PATCH",
          token: admin.token,
          body: { status: "Approved", version: 0 },
          status: 409,
        });
        await request("/ocr/verify", {
          method: "POST",
          token: citizen.token,
          body: {},
          status: 400,
        });
        const bad = new FormData();
        bad.append("document", new Blob(["not an image"]), "fake.png");
        await request("/ocr/verify", {
          method: "POST",
          token: citizen.token,
          body: bad,
          status: 415,
        });
      },
    );
    await t.test(
      "real file attachment, private retrieval and document review",
      async () => {
        for (const doc of application.documents) {
          const form = new FormData();
          form.append(
            "document",
            new Blob(["%PDF-1.4\nTest document for manual officer review"], {
              type: "application/pdf",
            }),
            "proof.pdf",
          );
          const uploaded = await request(
            `/applications/${application.id}/documents/${doc.id}/upload`,
            { method: "POST", token: citizen.token, body: form },
          );
          application = uploaded.application;
          assert.equal(uploaded.ocr.verified, false);
          const updated = application.documents.find(
            (item) => item.id === doc.id,
          );
          await request(`/files/${updated.fileId}`, {
            token: other.token,
            status: 404,
          });
          const file = await fetch(`${url}/files/${updated.fileId}`, {
            headers: { Authorization: `Bearer ${admin.token}` },
          });
          assert.equal(file.status, 200);
          assert.match(await file.text(), /%PDF-/);
          application = await request(
            `/applications/${application.id}/documents/${doc.id}`,
            {
              method: "PATCH",
              token: admin.token,
              body: { status: "verified", version: application.version },
            },
          );
        }
        assert.equal(application.status, "Officer review");
        await request(`/admin/applications/${application.id}/status`, {
          method: "PATCH",
          token: admin.token,
          body: { status: "Approved", version: 0 },
          status: 409,
        });
        application = await request(
          `/admin/applications/${application.id}/status`,
          {
            method: "PATCH",
            token: admin.token,
            body: { status: "Approved", version: application.version },
          },
        );
        assert.equal(application.progress, 100);
        assert.equal(
          (await request("/dashboard", { token: citizen.token })).metrics
            .openApplications,
          0,
        );
      },
    );
    let complaint;
    let note;
    await t.test(
      "complaint responses and per-user notification read state",
      async () => {
        complaint = await request("/complaints", {
          method: "POST",
          token: citizen.token,
          body: {
            subject: "Request clarification",
            department: "Revenue",
            applicationId: application.id,
            draft: "Please clarify next steps.",
          },
        });
        await request(`/admin/complaints/${complaint.id}`, {
          method: "PATCH",
          token: citizen.token,
          body: { status: "Resolved", response: "Completed", version: 0 },
          status: 403,
        });
        complaint = await request(`/admin/complaints/${complaint.id}`, {
          method: "PATCH",
          token: admin.token,
          body: {
            status: "Resolved",
            response: "Your certificate can be collected.",
            version: 0,
          },
        });
        await request(`/admin/complaints/${complaint.id}`, {
          method: "PATCH",
          token: admin.token,
          body: { status: "Resolved", response: "stale response", version: 0 },
          status: 409,
        });
        assert.equal(
          (await request("/complaints", { token: citizen.token }))[0].response,
          complaint.response,
        );
        assert.deepEqual(
          await request("/complaints", { token: other.token }),
          [],
        );
        assert.deepEqual(
          await request("/notifications", { token: other.token }),
          [],
        );
        note = (await request("/notifications", { token: citizen.token }))[0];
        await request(`/notifications/${note.id}/read`, {
          method: "PATCH",
          token: other.token,
          status: 404,
        });
        await request(`/notifications/${note.id}/read`, {
          method: "PATCH",
          token: citizen.token,
        });
      },
    );
    await t.test(
      "restart retains sessions, applications, documents, complaints and notifications",
      async () => {
        await stop();
        await start();
        assert.equal(
          (
            await request(`/applications/${application.id}`, {
              token: citizen.token,
            })
          ).status,
          "Approved",
        );
        assert.equal(
          (
            await request("/auth/login", {
              method: "POST",
              body: {
                email: "citizen@example.test",
                password: "citizen-password",
              },
            })
          ).user.id,
          citizen.user.id,
        );
        assert.equal(
          (await request("/complaints", { token: citizen.token }))[0].status,
          "Resolved",
        );
        assert.ok(
          (await request("/notifications", { token: citizen.token })).find(
            (item) => item.id === note.id,
          ).readAt,
        );
        const fileId = application.documents[0].fileId;
        assert.equal(
          (
            await fetch(`${url}/files/${fileId}`, {
              headers: { Authorization: `Bearer ${citizen.token}` },
            })
          ).status,
          200,
        );
      },
    );
  },
);
