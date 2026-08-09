import { apiFetch } from "../api-client";
export const userActivityApi = {
  tree: () => apiFetch<any[]>("/admin/user-activity/tree"),
  search: (q: string) => apiFetch<any[]>("/admin/user-activity/search", { query: { q } }),
  timeline: (id: string, from?: string, to?: string, category?: string) => apiFetch<any>(`/admin/user-activity/users/${id}/timeline`, { query: { from, to, category } }),
  overview: (from?: string, to?: string) => apiFetch<any>("/admin/user-activity/overview", { query: { from, to } }),
};
