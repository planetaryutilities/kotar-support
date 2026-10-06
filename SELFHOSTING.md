This guide describes how to deploy Kotar as a standalone service with:

- an existing GitLab instance,
- any compatible OpenID Connect (OIDC) identity provider,
- HTTPS ingress or reverse proxy,
- optional GitLab OAuth browser sign-in,
- Docker or Docker Compose.

The deployment is identity-provider neutral. Any OIDC provider that meets the requirements below can be used.

Architecture

The standalone service:

- serves the Kotar web application,
- authenticates users using OIDC,
- authorizes access based on an ID-token claim such as groups or roles,
- proxies Git smart-HTTP operations to explicitly configured GitLab instances,
- optionally performs GitLab OAuth authentication for individual users.

Repositories remain in the browser workspace. The server does not maintain repository checkouts and does not persist Git credentials.

There are two independent authentication relationships:

1. Kotar → OIDC provider
   Determines who is allowed to access the Kotar application.

2. Kotar → GitLab
   Determines which GitLab repositories the signed-in user may access.

Authenticating to Kotar does not automatically grant GitLab access. GitLab continues to enforce each user's own repository memberships, permissions, protected branches, and other access controls.

---

1. Prerequisites

The deployment requires:

- a DNS name for the Kotar service, for example:
  
  "https://ide.example.com"

- an OIDC-compatible identity provider,

- a GitLab instance reachable from the Kotar service,

- Docker,

- Node.js 24 or later for building and testing,

- TLS/HTTPS at the ingress or reverse proxy.

The GitLab instance may be public or internal. Internal GitLab instances can be explicitly enabled in the provider configuration.

---

2. Register Kotar with the OIDC Identity Provider

Create a confidential OIDC client/application for Kotar.

Use the following configuration.

Setting| Value
Application type| OpenID Connect
Flow| Authorization Code
PKCE| S256
Redirect URI| "<PUBLIC_ORIGIN>/auth/callback"
Client type| Confidential
Token signing| RS256 or ES256
Required token| Signed ID token

For example, if Kotar will be available at:

https://ide.example.com

the redirect URI must be:

https://ide.example.com/auth/callback

The redirect URI must match exactly, including scheme, hostname, and port when a non-default port is used.

OIDC scopes

The default scopes are:

openid profile email groups

Configure them with:

OIDC_SCOPES="openid profile email groups"

Not every provider defines a "groups" scope.

If the identity provider does not recognize "groups", use for example:

OIDC_SCOPES="openid profile email"

and configure the provider to include the appropriate authorization claim in the ID token independently of the requested scopes.

The important requirement is that the ID token contains the claim Kotar uses for authorization.

---

3. Configure Authorization

Kotar authorizes users by comparing a claim from the OIDC ID token against "ALLOWED_GROUPS".

The claim is selected with:

OIDC_GROUPS_CLAIM

The default is:

OIDC_GROUPS_CLAIM=groups

Examples:

Identity provider representation| "OIDC_GROUPS_CLAIM"
"groups: [...]"| "groups"
group paths| "groups"
roles under "realm_access.roles"| "realm_access.roles"
roles under a client object| "resource_access.<client>.roles"
custom nested claim| dotted path to that claim

Example:

ALLOWED_GROUPS=sysml-ide-users

or:

ALLOWED_GROUPS=engineering/sysml-users

The comparison is exact except that a leading "/" on a group path is ignored.

The identity provider therefore needs to include the selected claim in the ID token, not only in an access token or UserInfo response.

---

4. Configure the OIDC Issuer

Set:

OIDC_ISSUER=<issuer>
OIDC_CLIENT_ID=<client-id>

Use the exact issuer advertised by the identity provider's OIDC discovery document.

Do not use the discovery-document URL itself.

The service obtains the authorization, token, and JWKS endpoints through OIDC discovery. These endpoints must be compatible with the configured issuer.

For an identity provider using an internal certificate authority, mount the CA certificate and configure:

NODE_EXTRA_CA_CERTS=/path/to/ca.pem

Do not disable TLS certificate validation.

---

5. Create the Session Secret

Kotar sessions are protected using "SESSION_SECRET".

Create a strong random value:

mkdir -p deploy/secrets
chmod 700 deploy/secrets

(umask 077; openssl rand -hex 32 > deploy/secrets/session_secret)

Keep this value stable across:

- container restarts,
- upgrades,
- replicas.

All replicas must use the same value.

Changing the session secret invalidates existing user sessions.

---

6. Configure the Deployment

Copy the example files:

cp deploy/service.env.example deploy/service.env
cp deploy/gitlab-providers.example.json deploy/gitlab-providers.json

A typical "deploy/service.env" contains values such as:

PUBLIC_ORIGIN=https://ide.example.com

OIDC_ISSUER=https://identity.example.com/<issuer-path>
OIDC_CLIENT_ID=<client-id>

OIDC_SCOPES=openid profile email groups
OIDC_GROUPS_CLAIM=groups
ALLOWED_GROUPS=sysml-ide-users

SESSION_TTL_HOURS=8

Store the OIDC client secret in:

deploy/secrets/oidc_client_secret

and restrict access:

chmod 600 deploy/secrets/oidc_client_secret

Prefer mounted secret files or your orchestration platform's secret-management mechanism over placing secrets directly into configuration files.

---

7. Configure GitLab

Create:

deploy/gitlab-providers.json

with the GitLab instances that Kotar may access.

For example:

[
  {
    "label": "Corporate GitLab",
    "origin": "https://gitlab.example.com"
  }
]

For an internal GitLab address:

[
  {
    "label": "Internal GitLab",
    "origin": "https://gitlab.internal.example",
    "allowPrivateNetwork": true
  }
]

Origins:

- must use HTTPS,
- must contain no path,
- must contain no credentials,
- are matched exactly,
- may contain a non-default port.

For example:

{
  "label": "Engineering GitLab",
  "origin": "https://gitlab.internal.example:8443",
  "allowPrivateNetwork": true
}

"allowPrivateNetwork" permits explicitly configured RFC1918/ULA destinations. Loopback, link-local, metadata-service, and other special addresses remain blocked.

Restart the service after modifying the provider configuration. Rebuilding the image is not necessary.

---

8. Configure GitLab Browser Sign-In

Browser-based GitLab authentication is recommended.

Without it, users can still provide GitLab access tokens manually, but those credentials must be entered again after the browser session is reloaded.

Create the GitLab OAuth application

For a self-hosted GitLab instance, create an instance-wide application under:

Admin → Applications → New application

Recommended configuration:

Field| Value
Name| "Kotar"
Redirect URI| "<PUBLIC_ORIGIN>/auth/gitlab/callback"
Confidential| enabled
Trusted| enabled, if available
Scope| "read_api"
Scope| "read_repository"
Scope| "write_repository"

For example:

https://ide.example.com/auth/gitlab/callback

The scopes provide:

- "read_api" — project and group discovery,
- "read_repository" — clone, fetch, and pull,
- "write_repository" — push.

Kotar does not require GitLab's broad "api" scope.

For a read-only deployment, use:

read_api read_repository

and configure Kotar's "oauthScopes" to match.

Configure the GitLab application ID

Add the OAuth application ID to "deploy/gitlab-providers.json":

[
  {
    "label": "Corporate GitLab",
    "origin": "https://gitlab.example.com",
    "oauthClientId": "<application-id>"
  }
]

The application ID is not secret.

---

9. Configure the GitLab OAuth Secret

The GitLab OAuth client secret should preferably be supplied through a mounted secret.

For:

https://gitlab.example.com

the corresponding variable name is:

GITLAB_OAUTH_CLIENT_SECRET_GITLAB_EXAMPLE_COM

The preferred file-based equivalent is:

GITLAB_OAUTH_CLIENT_SECRET_GITLAB_EXAMPLE_COM_FILE

For example:

GITLAB_OAUTH_CLIENT_SECRET_GITLAB_EXAMPLE_COM_FILE=/run/secrets/gitlab_oauth_client_secret

The naming rule is:

1. take the GitLab hostname,
2. include the port if non-default,
3. replace non-alphanumeric characters with "_",
4. convert to uppercase.

For example:

https://gitlab.example.com:8443

becomes:

GITLAB_OAUTH_CLIENT_SECRET_GITLAB_EXAMPLE_COM_8443

Do not commit OAuth secrets into the repository.

---

10. Build the Application

From the repository root:

cd web
npm run build
npm run test:service
cd ..

Then build the container:

docker compose build

Optionally run the container smoke test:

npm --prefix web run smoke:container -- sysmlv2-web-ide:local

Start the service:

docker compose up -d

---

11. Configure the Reverse Proxy or Ingress

By default the Compose deployment binds:

127.0.0.1:8080

Route the public HTTPS endpoint to this service.

For example:

https://ide.example.com
        |
        v
reverse proxy / ingress
        |
        v
127.0.0.1:8080

If the ingress runs in the same container network, route directly to:

ide:8080

The ingress must preserve:

- request paths,
- "Origin",
- cookies,
- streaming request bodies,
- streaming response bodies.

Configure upload limits and timeouts appropriate for Git operations.

Do not expose the backend directly using public HTTP.

TLS should terminate at the ingress or reverse proxy. HTTPS is required for normal authentication because Kotar's session cookies are Secure cookies.

---

12. GitLab and Reverse-Proxy Requirements

Git smart HTTP must reach GitLab's native Git authentication endpoints.

A reverse proxy or SSO gateway in front of GitLab must not transform Git requests into an interactive HTML login.

For example, a request such as:

https://gitlab.example.com/group/project.git/info/refs?service=git-upload-pack

should receive GitLab's normal Git response or authentication challenge.

It must not receive:

302 → interactive-login-page

The Kotar Git bridge deliberately rejects redirects and non-Git responses.

The same applies to GitLab OAuth endpoints used during browser sign-in.

---

13. Internal Certificate Authorities

If either:

- GitLab, or
- the OIDC provider

uses a private CA, mount the CA bundle and configure:

NODE_EXTRA_CA_CERTS=/path/to/ca.pem

The runtime must trust the certificate chain used by all configured upstream services.

Never work around certificate problems by disabling TLS verification.

---

14. Network Requirements

The runtime normally needs outbound HTTPS connectivity only to:

- the configured OIDC issuer,
- the configured GitLab instances,
- any explicitly configured external Git providers.

Restricting outbound connectivity to these destinations provides an additional security boundary.

The Git bridge:

- validates Git smart-HTTP paths,
- validates DNS results,
- pins the selected upstream address,
- verifies TLS,
- strips cookies and forwarding headers,
- rejects redirects,
- rejects invalid Git responses,
- limits request and response sizes.

---

15. Service Limits

Default limits include:

Maximum Git transfer:    256 MiB
Concurrent Git requests: 8 per process
Upstream timeout:        120 seconds
Idle timeout:            30 seconds

Relevant configuration variables include:

GIT_MAX_BYTES
GIT_MAX_CONCURRENT
GIT_TIMEOUT_MS

There is no automatic retry for Git POST operations.

If a push fails during "receive-pack", check the remote state before retrying.

---

16. Health Check

The service exposes:

GET /healthz

This endpoint is unauthenticated and verifies that the service started with valid configuration.

It does not perform live connectivity tests against GitLab or the OIDC provider.

The container health check uses this endpoint.

---

17. Verify OIDC Authentication

Open:

https://ide.example.com

You should be redirected to the configured identity provider.

After authentication:

1. the provider redirects to:
   
   https://ide.example.com/auth/callback

2. Kotar validates the ID token,

3. the configured authorization claim is inspected,

4. access is granted if the claim contains an entry matching "ALLOWED_GROUPS".

If authentication succeeds but access is denied, inspect:

OIDC_GROUPS_CLAIM
ALLOWED_GROUPS
OIDC_SCOPES

and verify that the expected claim is actually present in the ID token.

---

18. Verify GitLab Integration

After signing in to Kotar, open:

https://ide.example.com/api/git/providers

A GitLab instance with OAuth configured should report:

"auth": {
  "token": true,
  "oauth": true
}

Then in Kotar:

1. select Sign in to GitLab,
2. select the configured GitLab instance,
3. complete the GitLab authorization flow,
4. open Open from GitLab,
5. verify that your projects are listed,
6. clone a repository,
7. create a branch,
8. commit a change,
9. push the branch,
10. fetch or pull the change from another workspace.

GitLab continues to apply the user's normal permissions and branch-protection rules.

---

19. Common Problems

Symptom| Likely cause
OIDC login reports "invalid_scope"| "OIDC_SCOPES" contains a scope the provider does not define
Login succeeds but Kotar denies access| authorization claim is missing or does not match "ALLOWED_GROUPS"
Login callback fails| registered redirect URI does not exactly match "<PUBLIC_ORIGIN>/auth/callback"
Users are logged out after every restart| "SESSION_SECRET" is changing
One replica accepts sessions created by another only intermittently| replicas do not share the same "SESSION_SECRET"
GitLab only offers token authentication| "oauthClientId" is missing or the service was not restarted
GitLab reports invalid redirect URI| OAuth callback is not exactly "<PUBLIC_ORIGIN>/auth/gitlab/callback"
GitLab OAuth returns "invalid_client"| OAuth secret is missing, incorrect, or uses the wrong variable name
GitLab login succeeds but projects cannot be listed| "read_api" is missing
Clone returns 403 or 404| user's GitLab permissions or repository membership
Push returns 403| branch protection, user permissions, or missing "write_repository"
Git operation receives a redirect or HTML page| proxy/SSO layer in front of GitLab is intercepting Git smart HTTP
TLS validation fails| internal CA is not present in "NODE_EXTRA_CA_CERTS"

---

20. Security Recommendations

For production deployments:

- expose Kotar only through HTTPS,
- use a confidential OIDC client,
- use a confidential GitLab OAuth application,
- store client secrets in mounted secrets or a secret manager,
- keep "SESSION_SECRET" stable and protected,
- explicitly allow only required GitLab instances,
- use "allowPrivateNetwork" only when necessary,
- restrict outbound network access where practical,
- never disable TLS certificate validation,
- keep GitLab's native authorization and branch protections enabled,
- use short OIDC session lifetimes where group removal must revoke access quickly,
- do not place access tokens, OAuth secrets, or session secrets in source control.

The container runs as a non-root user, uses a read-only root filesystem, requires no repository-storage volume, and does not persist Git repository contents on the server.

---

21. Authentication Model Summary

A production deployment has two independent registrations:

Registration| Purpose
OIDC client| Controls who may access Kotar
GitLab OAuth application| Allows those users to access GitLab as themselves

The resulting flow is:

User
  |
  | OIDC login
  v
Identity Provider
  |
  | ID token
  v
Kotar
  |
  | user's GitLab OAuth authorization
  v
GitLab
  |
  | user's GitLab permissions
  v
Repositories

This separation is intentional.

Kotar authentication establishes access to the application. GitLab authentication establishes access to repositories. Kotar does not translate an identity-provider token into a GitLab credential and does not bypass GitLab's own authorization controls.existing distinction that browser sign-in uses OAuth/PKCE while the access-token approach remains available as a fallback. 
