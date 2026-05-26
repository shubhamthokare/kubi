# Backend Deployment – Environment Variable List

| Variable | Source (K8s Secret) | Description |
|----------|--------------------|-------------|
| **DB_PASSWORD** | `db-password` (key `DB_PASSWORD`) | Database password for the MongoDB instance |
| **RESEND_API_KEY** | `resend-api-key` (key `RESEND_API_KEY`) | API key for Resend email service |
| **JWT_SECRET_KEY** | `jwt-secret` (key `JWT_SECRET_KEY`) | Secret used to sign JWT tokens |
| **GEMINI_API_KEY** | `gemini-api-key` (key `GEMINI_API_KEY`) | API key for the Gemini AI service |
| **GCP_PROJECT_ID** | (environment variable) | GCP project identifier for Secret Manager (empty in dev) |
| **GCP_REGION** | (environment variable) | GCP region/location for Secret Manager (empty in dev) |
| **GITLAB_TOKEN** | `gitlab-token` (key `GITLAB_TOKEN`) | Private token for GitLab API access |
| **ENVIRONMENT** | (static value) | Set to `production` for the prod overlay |
| **ARIZE_SPACE_ID** | `kubi-secrets` (key `ARIZE_SPACE_ID`) | Optional Arize AI space identifier |
| **ARIZE_API_KEY** | `kubi-secrets` (key `ARIZE_API_KEY`) | Optional Arize AI API key |
| **ARIZE_PROJECT_NAME** | (static value) | Arize project name (`kubi-prod-backend`) |
| **SSO_CLIENT_ID** | `kubi-secrets` (key `SSO_CLIENT_ID`) | SSO client identifier |
| **SSO_CLIENT_SECRET** | `kubi-secrets` (key `SSO_CLIENT_SECRET`) | SSO client secret |

> **Note**: All secret names are referenced in **UPPERCASE** as required by the project policy. In development the `GCP_PROJECT_ID` and `GCP_REGION` variables are left empty; they will be populated by the production overlay via GCP Secret Manager.
