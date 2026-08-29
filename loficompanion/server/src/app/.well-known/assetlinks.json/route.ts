// Android App Link verification file (assetlinks.json).
// Served at https://auth.zhongbei.tech/.well-known/assetlinks.json
//
// NOTE: replace each `<SHA256_FINGERPRINT>` with the release signing-certificate
// SHA-256 fingerprint (run: keytool -list -v -keystore app-release.jks
// -alias <alias> | grep SHA256, then format with : between each byte pair and
// strip the leading "SHA256: "). Android autoVerify compares this against the
// installed app's signing cert, so the value MUST match the signed release.
//
// Multiple apps share this domain (starter template). Production apps should
// use distinct domains (or path prefixes) to avoid link competition.
export function GET() {
  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.mobileui.mobileui_flutter',
        sha256_cert_fingerprints: ['<SHA256_FINGERPRINT>'],
      },
    },
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.mobileui.mobilestarter',
        sha256_cert_fingerprints: ['<SHA256_FINGERPRINT>'],
      },
    },
  ];
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}
