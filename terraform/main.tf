locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
  }

  container_image = var.container_image != "" ? var.container_image : "${aws_ecr_repository.app.repository_url}:${var.container_image_tag}"

  redis_url = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"

  container_environment = concat(
    [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "HOST", value = "0.0.0.0" },
      { name = "REDIS_URL", value = local.redis_url },
    ],
    var.cors_origin != "" ? [{ name = "CORS_ORIGIN", value = var.cors_origin }] : []
  )

  container_secrets = [
    { name = "GEMINI_API_KEY", valueFrom = aws_secretsmanager_secret.gemini.arn },
    { name = "PAGESPEED_API_KEY", valueFrom = aws_secretsmanager_secret.pagespeed.arn },
  ]
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "random_id" "bucket" {
  byte_length = 3
}

resource "aws_s3_bucket" "app" {
  bucket        = "${var.project_name}-storage-${random_id.bucket.hex}"
  force_destroy = true
  tags          = local.common_tags
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket                  = aws_s3_bucket.app.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_ecr_repository" "app" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "gemini" {
  name_prefix = "${var.project_name}-gemini-"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret_version" "gemini" {
  secret_id     = aws_secretsmanager_secret.gemini.id
  secret_string = var.gemini_api_key
}

resource "aws_secretsmanager_secret" "pagespeed" {
  name_prefix = "${var.project_name}-pagespeed-"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret_version" "pagespeed" {
  secret_id     = aws_secretsmanager_secret.pagespeed.id
  secret_string = var.pagespeed_api_key
}

# AWS Academy accounts often block iam:CreateRole.
# Reuse an existing role (default: LabRole) for both execution and task access.

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}/api"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.project_name}/worker"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  description = "HTTP from the internet to the ALB"
  vpc_id      = data.aws_vpc.default.id
  tags        = merge(local.common_tags, { Name = "${var.project_name}-alb" })
  lifecycle {
    create_before_destroy = true
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${var.project_name}-ecs-"
  description = "Fargate tasks (API + worker)"
  vpc_id      = data.aws_vpc.default.id
  tags        = merge(local.common_tags, { Name = "${var.project_name}-ecs" })
  lifecycle {
    create_before_destroy = true
  }

  ingress {
    description     = "API from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-redis-"
  description = "ElastiCache Redis"
  vpc_id      = data.aws_vpc.default.id
  tags        = merge(local.common_tags, { Name = "${var.project_name}-redis" })
  lifecycle {
    create_before_destroy = true
  }

  ingress {
    description     = "Redis from ECS tasks"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnets"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = substr(replace(var.project_name, "_", "-"), 0, 40)
  description                = "Redis for ${var.project_name}"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  automatic_failover_enabled = false
  multi_az_enabled           = false
  num_cache_clusters         = 1
  at_rest_encryption_enabled = true
  transit_encryption_enabled  = false
}

resource "random_id" "alb" {
  byte_length = 2
}

resource "aws_lb" "main" {
  name_prefix        = "alb-"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
  tags               = merge(local.common_tags, { Name = "${var.project_name}-alb" })
}

resource "aws_lb_target_group" "api" {
  name_prefix = "api-"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
  tags = local.common_tags
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project_name}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.fargate_cpu
  memory                   = var.fargate_memory
  execution_role_arn       = var.ecs_task_role_arn
  task_role_arn            = var.ecs_task_role_arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = local.container_image
      essential = true
      command = ["node", "dist/api/server.js"]
      portMappings = [{
        containerPort = 3000
        protocol      = "tcp"
      }]
      environment = local.container_environment
      secrets     = local.container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
    },
    {
      name      = "worker"
      image     = local.container_image
      essential = true
      command   = ["node", "dist/queue/worker.js"]
      environment = local.container_environment
      secrets     = local.container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.worker.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "worker"
        }
      }
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "app" {
  name            = "${var.project_name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  depends_on = [aws_lb_listener.http]
  tags       = local.common_tags
}
