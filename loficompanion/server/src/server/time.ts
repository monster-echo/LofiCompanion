export function nowIso() {
  return new Date().toISOString();
}

export function sinceIso(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

const HOUR = 13; // length of "YYYY-MM-DDTHH" from an ISO timestamp

export function hourBucket(iso: string) {
  return iso.slice(0, HOUR);
}
