// Test-only shim for `next/server`. The service-layer integration tests exercise
// domain logic (signUp, refresh, verifyEmail) that only uses the ApiError class,
// never the HTTP response helpers. The real Next.js layer is validated via the
// production build and manual API traces, not these unit tests.
export class NextResponse {
  constructor(body, init) {
    this.body = body;
    this.init = init;
  }
  static json(body, init) {
    return new NextResponse(body, init);
  }
}
export class NextRequest {}
