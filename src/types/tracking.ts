export interface TrackingSummary {
  pageViews: number;
  sessions: number;
  activityOpens: number;
  previewOpens: number;
  generationRequests: number;
  generationSuccesses: number;
  generationFailures: number;
  downloadClicks: number;
  signupStarts: number;
  checkoutStarts: number;
}

export interface TrackingEvent {
  name: string;
  path: string;
  activityKind: string | null;
  occurredAt: string;
}

export interface TrackingSession {
  sessionId: string;
  startedAt: string;
  lastSeenAt: string;
  device: string;
  eventCount: number;
  authenticated: boolean;
  events: TrackingEvent[];
}

export interface TrackingReport {
  days: number;
  retentionDays: number;
  generatedAt: string;
  summary: TrackingSummary;
  daily: { date: string; pageViews: number; sessions: number; activityOpens: number }[];
  topPages: { path: string; views: number; sessions: number }[];
  activities: {
    activityKind: string;
    opens: number;
    publicPreviews: number;
    previewRequests: number;
    generationRequests: number;
    generationSuccesses: number;
    generationFailures: number;
    downloads: number;
  }[];
  journeys: { fromPath: string; toPath: string; count: number }[];
  recentSessions: TrackingSession[];
}
