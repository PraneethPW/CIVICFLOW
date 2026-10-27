import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { API_URL } from "./api";

export function Runtime({ signedIn }: { signedIn: boolean }) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connecting");
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const failure = (event: Event) =>
      setError((event as CustomEvent<string>).detail);
    const connection = (event: Event) =>
      setStatus((event as CustomEvent<string>).detail);
    window.addEventListener("civicflow:error", failure);
    window.addEventListener("civicflow:connection", connection);
    return () => {
      window.removeEventListener("civicflow:error", failure);
      window.removeEventListener("civicflow:connection", connection);
    };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const back = NativeApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && location.pathname !== "/") navigate(-1);
      else void NativeApp.exitApp();
    });
    return () => {
      void back.then((listener) => listener.remove());
    };
  }, [navigate, location.pathname]);
  return (
    <>
      {signedIn && (
        <div
          role="status"
          className={`px-4 py-2 text-center text-xs ${status === "Live" ? "bg-teal-950 text-teal-200" : "bg-amber-950 text-amber-200"}`}
        >
          {status === "Live"
            ? "● Live updates connected"
            : `${status} · Changes sync when the connection returns`}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="sticky top-16 z-50 flex items-center justify-between gap-4 bg-rose-950 px-4 py-3 text-rose-100"
        >
          <p>{error}</p>
          <button
            aria-label="Dismiss error"
            onClick={() => setError("")}
            className="rounded border border-rose-300/40 px-3 py-1"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
export function ServerSettings() {
  const [value, setValue] = useState(API_URL);
  const [error, setError] = useState("");
  if (!Capacitor.isNativePlatform()) return null;
  function save() {
    try {
      const url = new URL(value.trim());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.endsWith("/api")
      )
        throw new Error("Enter a full API address ending in /api.");
      if (import.meta.env.MODE !== "android-local" && url.protocol !== "https:")
        throw new Error(
          "This build requires an HTTPS server. Use an android-local build for local HTTP testing.",
        );
      localStorage.setItem("civicflow_api_url", url.href.replace(/\/$/, ""));
      localStorage.removeItem("civicflow_token");
      localStorage.removeItem("civicflow_user");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid server address");
    }
  }
  return (
    <details className="mt-6 rounded-lg border border-white/20 p-4">
      <summary>Server connection settings</summary>
      <p className="my-3 text-sm text-slate-400">
        Use your hosted API, laptop LAN IP, or 10.0.2.2 for the Android
        emulator. Changing server signs you out.
      </p>
      <input
        aria-label="API server address"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded bg-slate-950 p-3"
      />
      <button
        type="button"
        onClick={save}
        className="mt-3 rounded border border-white/20 px-4 py-2"
      >
        Save server
      </button>
      {error && (
        <p role="alert" className="mt-2 text-rose-200">
          {error}
        </p>
      )}
    </details>
  );
}
