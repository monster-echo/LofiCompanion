// 错误/提示域文案（en-US）。
export const errors = {
  operationFailed: 'Something went wrong',
  featureDisabled: "This feature isn't enabled for this app",
  contentUnavailable: "That content isn't available — back to Home",
  signInSuccess: 'Signed in',
  signUpSuccess: 'Account created',
  phoneSignInSuccess: 'Signed in with phone',
  credentialsCleared: 'Server session not revoked yet — local credentials cleared',
  purchaseFailed: 'Purchase failed',
  syncFailed: 'Sync failed',
  loadFailed: "Couldn't load",
  serverUnavailable: 'Server unavailable — try again later',
  requestFailed: 'Request failed',
  badResponse: 'Server returned unrecognized data',
  networkUnreachable: "Can't reach the server — check your connection and retry",
} as const;
