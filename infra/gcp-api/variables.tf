variable "project_id" {
  type        = string
  description = "Google Cloud project ID."
}

variable "region" {
  type        = string
  description = "Primary deployment region."
  default     = "us-central1"
}

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/name form."
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name."
  default     = "finance-companion-api"
}

variable "artifact_repository_id" {
  type        = string
  description = "Artifact Registry repository name."
  default     = "finance-companion-api"
}

variable "allowed_email" {
  type        = string
  description = "Allowed email address for the hardcoded user."
  default     = "steveborgra@gmail.com"
}

variable "entra_client_id" {
  type        = string
  description = "Microsoft Entra application client ID."
}

variable "entra_tenant_id" {
  type        = string
  description = "Microsoft Entra tenant ID."
}

variable "session_secret" {
  type        = string
  description = "Session signing secret."
  sensitive   = true
}

variable "cors_origins" {
  type        = list(string)
  description = "Allowed CORS origins for the SPA."
  default     = ["http://localhost:5173"]
}

variable "bootstrap_image" {
  type        = string
  description = "Temporary image used until CI deploys the API image."
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}
