output "artifact_repository_name" {
  value = google_artifact_registry_repository.api.repository_id
}

output "cloud_run_service_name" {
  value = google_cloud_run_v2_service.api.name
}

output "cloud_run_service_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "github_workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "github_deployer_service_account" {
  value = google_service_account.deployer.email
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}
