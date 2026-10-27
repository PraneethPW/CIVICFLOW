import { useEffect, useRef } from "react";
import { API_URL } from "./api";

export function useLiveRefresh(refresh: () => unknown) {
  const callback = useRef(refresh);
  useEffect(() => {
    callback.current = refresh;
  });
  useEffect(() => {
    let active = true,
      loading = false,
      again = false;
    const update = async () => {
      if (!active) return;
      if (loading) {
        again = true;
        return;
      }
      loading = true;
      try {
        await callback.current();
      } catch {
        /* request interceptor reports errors */
      } finally {
        loading = false;
        if (again && active) {
          again = false;
          void update();
        }
      }
    };
    update();
    window.addEventListener("civicflow:change", update);
    // Recover from missed invalidations as well as proxy/network interruptions.
    const fallback = window.setInterval(update, 30000);
    return () => {
      active = false;
      window.removeEventListener("civicflow:change", update);
      clearInterval(fallback);
    };
  }, []);
}
export function useRealtime(token: string | null) {
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let controller: AbortController;
    let retry: ReturnType<typeof setTimeout>;
    let delay = 1000;
    let generation = 0;
    const status = (value: string) =>
      window.dispatchEvent(
        new CustomEvent("civicflow:connection", { detail: value }),
      );
    async function connect() {
      if (stopped) return;
      const current = ++generation;
      const connection = new AbortController();
      controller = connection;
      status(navigator.onLine ? "Connecting" : "Offline");
      try {
        const response = await fetch(`${API_URL.replace(/\/$/, "")}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: connection.signal,
        });
        if (stopped || current !== generation) return;
        if (response.status === 401) {
          window.dispatchEvent(new Event("civicflow:logout"));
          return;
        }
        if (!response.ok || !response.body)
          throw new Error("Stream unavailable");
        status("Live");
        delay = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped && current === generation) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";
          for (const frame of frames)
            if (frame.startsWith("data: ")) {
              window.dispatchEvent(
                new CustomEvent("civicflow:change", {
                  detail: JSON.parse(frame.slice(6)),
                }),
              );
            }
        }
      } catch {
        /* reconnect below; normal when Android suspends the WebView */
      }
      if (!stopped && current === generation) {
        status(navigator.onLine ? "Reconnecting" : "Offline");
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
    const restart = () => {
      generation++;
      clearTimeout(retry);
      controller?.abort();
      void connect();
    };
    const resume = () => {
      if (document.visibilityState === "visible") restart();
    };
    const online = restart;
    const offline = () => {
      generation++;
      clearTimeout(retry);
      status("Offline");
      controller?.abort();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", resume);
    void connect();
    return () => {
      stopped = true;
      generation++;
      clearTimeout(retry);
      controller?.abort();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [token]);
}
