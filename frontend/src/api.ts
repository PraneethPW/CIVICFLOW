import axios from "axios";
import { Capacitor } from "@capacitor/core";

export const API_URL =
  (Capacitor.isNativePlatform()
    ? localStorage.getItem("civicflow_api_url")
    : null) ||
  import.meta.env.VITE_API_URL ||
  "/api";
export const api = axios.create({ baseURL: API_URL, timeout: 90000 });
export function reportError(message: string) {
  window.dispatchEvent(new CustomEvent("civicflow:error", { detail: message }));
}
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("civicflow_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    reportError(
      error.response?.data?.message ||
        "Cannot reach the API. Check your connection and server address.",
    );
    if (
      error.response?.status === 401 &&
      !error.config?.url?.startsWith("/auth/")
    ) {
      localStorage.removeItem("civicflow_user");
      localStorage.removeItem("civicflow_token");
      window.dispatchEvent(new Event("civicflow:logout"));
    }
    return Promise.reject(error);
  },
);
// Used at UI event boundaries; the interceptor displays actionable API errors.
export async function run(action: () => unknown) {
  try {
    await action();
  } catch (error) {
    if (!axios.isAxiosError(error))
      reportError(
        error instanceof Error
          ? error.message
          : "Unable to complete this action.",
      );
  }
}
export async function downloadDocument(fileId: string, name: string) {
  const { data } = await api.get(`/files/${fileId}`, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  // Blob downloads are not supported by Android WebView. The native bridge handles the file instead.
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(data);
    });
    const saved = await Filesystem.writeFile({
      path: `review-${fileId}.${data.type === "application/pdf" ? "pdf" : data.type === "image/png" ? "png" : "jpg"}`,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({ title: name, url: saved.uri });
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
