variable "aws_region" {
  type        = string
  description = "AWS region for all resources."
  default     = "us-east-1"
}

variable "project_name" {
  type        = string
  description = "Short prefix for resource names (lowercase letters, numbers, hyphens)."
  default     = "whats-your-status"
}

variable "environment" {
  type        = string
  description = "Tag value for Environment."
  default     = "prod"
}

variable "container_image" {
  type        = string
  description = "Full image URI including tag (e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com/whats-your-status:latest). Leave empty to use this Terraform-provisioned ECR repo + image tag."
  default     = ""
}

variable "container_image_tag" {
  type        = string
  description = "Tag used when container_image is empty (matches CI push of :tag and :latest)."
  default     = "latest"
}

variable "gemini_api_key" {
  type        = string
  description = "Google Gemini API key (stored in Secrets Manager, injected into containers)."
  sensitive   = true
  default     = ""
}

variable "pagespeed_api_key" {
  type        = string
  description = "Google PageSpeed Insights API key."
  sensitive   = true
  default     = ""
}

variable "cors_origin" {
  type        = string
  description = "Optional comma-separated origins for @fastify/cors (e.g. https://your-spa.example). Leave blank to allow any origin (not ideal for production)."
  default     = ""
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache instance size for Redis."
  default     = "cache.t4g.micro"
}

variable "fargate_cpu" {
  type        = number
  description = "Fargate task CPU units (1024 = 1 vCPU) for the combined api+worker task."
  default     = 1024
}

variable "fargate_memory" {
  type        = number
  description = "Fargate task memory (MiB) for the combined api+worker task."
  default     = 2048
}

variable "ecs_task_role_arn" {
  type        = string
  description = "Existing IAM role ARN to use for both ECS execution and task role (AWS Academy LabRole)."
  default     = "arn:aws:iam::859993703623:role/LabRole"
}
