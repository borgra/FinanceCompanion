# GCP API Infrastructure

This Terraform stack provisions the FastAPI backend on Google Cloud with a close-to-free posture:

- Cloud Run with `min_instance_count = 0`
- Artifact Registry for container images
- Secret Manager for the API session secret
- Workload Identity Federation so GitHub Actions can deploy without a long-lived key

## Why this shape

Cloud Run keeps the runtime cost low because it scales to zero and has a free tier. Microsoft Entra is configured as the identity provider, while the API validates the returned Entra token before issuing its own application session.

## Prerequisites

- Terraform `>= 1.9`
- A Google Cloud project with billing enabled
- A Microsoft Entra app registration for the frontend

## Apply

```powershell
cd infra/gcp-api
terraform init
terraform apply -var-file="terraform.tfvars"
```

Start from [terraform.tfvars.example](terraform.tfvars.example).

## Important outputs

After `terraform apply`, capture:

- `github_workload_identity_provider`
- `github_deployer_service_account`
- `artifact_repository_name`
- `cloud_run_service_name`
- `runtime_service_account`
- `cloud_run_service_url`

These map directly to GitHub repository variables used by the deploy workflow.

## GitHub variables required

Set these repository variables:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_ARTIFACT_REPOSITORY`
- `GCP_CLOUD_RUN_SERVICE`
- `GCP_RUNTIME_SERVICE_ACCOUNT`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

Set these frontend variables or environment values separately:

- `VITE_API_BASE_URL`
- `VITE_ENTRA_CLIENT_ID`
- `VITE_ENTRA_TENANT_ID`

## Notes

- The infrastructure uses a public bootstrap image until the deploy pipeline publishes the real API image.
- The API itself still enforces application authentication. Public Cloud Run access is only there so the browser can reach the service directly.
