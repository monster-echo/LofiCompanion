export const routes = {
  overview: '/',
  config: '/config',
  logs: '/logs',
  online: '/online',
  apps: '/apps',
} as const;

export type RoutePath = (typeof routes)[keyof typeof routes];
