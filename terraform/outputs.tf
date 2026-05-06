output "s3_bucket_id" {
  description = "Application S3 bucket (versioning, SSE-S3, public access block enabled)."
  value       = aws_s3_bucket.app.id
}

output "ecr_repository_url" {
  description = "ECR registry URL for docker push (registry only)."
  value       = aws_ecr_repository.app.repository_url
}

output "ecr_repository_name" {
  description = "Repository name only — use for GitHub secret ECR_REPOSITORY."
  value       = aws_ecr_repository.app.name
}

output "ecs_cluster_name" {
  description = "ECS cluster name — GitHub secret ECS_CLUSTER."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "Single ECS service (API + worker containers) — GitHub secret ECS_SERVICE."
  value       = aws_ecs_service.app.name
}

output "load_balancer_dns" {
  description = "HTTP URL host (append http:// for the API)."
  value       = aws_lb.main.dns_name
}

output "redis_primary_endpoint" {
  description = "ElastiCache primary endpoint (REDIS_URL is injected into tasks automatically)."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}