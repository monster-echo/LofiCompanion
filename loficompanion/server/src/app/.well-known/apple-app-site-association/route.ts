// Apple Universal Link verification file (AASA).
// Served at https://auth.zhongbei.tech/.well-known/apple-app-site-association
//
// NOTE: replace `<TEAM_ID>` with the actual Apple Developer Team ID before
// this takes effect. iOS verifies this file on device (associated-domains
// entitlement + Apple Developer portal association) and requires content-type
// application/json with a team-scoped appID.
//
// Multiple apps share this domain (starter template). Production apps should
// use distinct domains (or distinct path prefixes) to avoid link competition.
export function GET() {
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          // Flutter app
          appID: '<TEAM_ID>.top.rwecho.cortexterminal',
          paths: ['*'],
        },
        {
          // React Native app
          appID: '<TEAM_ID>.com.mobileui.mobilestarter',
          paths: ['*'],
        },
      ],
    },
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}
