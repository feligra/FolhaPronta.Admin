import { api } from "@/services/api";
import type { TrackingReport } from "@/types/tracking";

export async function getTrackingReport(days: 7 | 30, signal?: AbortSignal): Promise<TrackingReport> {
  const response = await api.get<TrackingReport>("/admin/tracking", { params: { days }, signal });
  return response.data;
}
