export type AdminProfile = Readonly<{
  id: string;
  username: string;
  email: string;
  createdAt: string;
}>;

export type Overview = Readonly<{
  configVersion: number;
  users: number;
  activeSessions: number;
  onlineSessions: number;
  onlineUsers: number;
  events24h: number;
  activeUsers24h: number;
  notifications: number;
  lastEventAt: string | null;
}>;

export type AppSummary = Readonly<{
  appId: string;
  environments: readonly string[];
  users: number;
  events24h: number;
  online: number;
  lastSeenAt: string | null;
}>;

export type LogTally = Readonly<{ key: string; count: number }>;
export type HourPoint = Readonly<{ bucket: string; count: number }>;

export type LogRow = Readonly<{
  eventId: string;
  name: string;
  screenId: string | null;
  platform: string;
  appVersion: string;
  occurredAt: string;
  receivedAt: string;
  anonymousId: string;
  userId: string | null;
  properties: Record<string, unknown>;
}>;

export type LogSummary = Readonly<{
  total: number;
  byName: readonly LogTally[];
  byPlatform: readonly LogTally[];
  series: readonly HourPoint[];
  names: readonly string[];
  platforms: readonly string[];
}>;

export type OnlineSession = Readonly<{
  id: string;
  userId: string;
  username: string | null;
  deviceName: string;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
}>;

export type OnlineStats = Readonly<{
  onlineSessions: number;
  onlineUsers: number;
  activeSessions: number;
  totalSessions: number;
  series: readonly HourPoint[];
  sessions: readonly OnlineSession[];
}>;
