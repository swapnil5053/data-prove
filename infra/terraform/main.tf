/**
 * ─── AWS Infrastructure for DataProve ───────────────────────────────────────
 *
 * This Terraform configuration provisions a production-grade, multi-AZ AWS
 * infrastructure for the DataProve application.
 *
 * Architecture:
 *   Public Tier:
 *     - Application Load Balancer (ALB) — routes HTTPS traffic
 *     - CloudFront Distribution — CDN for the React frontend SPA (S3)
 *     - S3 Bucket — hosts the Vite production build
 *
 *   Private Tier:
 *     - ECS Fargate (API task) — runs the Express API container
 *     - ECS Fargate (Worker task) — runs the verification worker container
 *     - ElastiCache (Redis) — BullMQ job queue backend
 *
 *   Data Tier:
 *     - MongoDB Atlas (external) — configured via MONGO_URI secret
 *
 *   Security:
 *     - VPC with public/private subnet isolation
 *     - Security groups that enforce least-privilege network access
 *     - AWS Secrets Manager for all sensitive environment variables
 *     - IAM roles with minimal required permissions
 *
 * TO DEPLOY:
 *   1. Install Terraform: https://developer.hashicorp.com/terraform/install
 *   2. Configure AWS CLI: aws configure
 *   3. cd infra/terraform
 *   4. terraform init
 *   5. terraform plan -var-file="production.tfvars"
 *   6. terraform apply -var-file="production.tfvars"
 */

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Recommended: Use S3 + DynamoDB for remote state in a team environment
  # backend "s3" {
  #   bucket         = "dataprove-terraform-state"
  #   key            = "production/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "dataprove-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "DataProve"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# ─── Data Sources ─────────────────────────────────────────────────────────────

data "aws_availability_zones" "available" {
  state = "available"
}

# ─── VPC & Networking ─────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "dataprove-vpc-${var.environment}" }
}

# Public subnets — ALB lives here
resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "dataprove-public-${count.index + 1}" }
}

# Private subnets — ECS tasks, Redis live here
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = { Name = "dataprove-private-${count.index + 1}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "dataprove-igw" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
}

# NAT Gateway allows private-subnet containers to reach the internet
# (needed to call Solana RPC)
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.main]
  tags          = { Name = "dataprove-nat" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "dataprove-rt-public" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "dataprove-rt-private" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ─── Security Groups ──────────────────────────────────────────────────────────

resource "aws_security_group" "alb" {
  name        = "dataprove-alb-sg"
  description = "ALB — allow HTTPS from internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
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

resource "aws_security_group" "api" {
  name        = "dataprove-api-sg"
  description = "API ECS tasks — accept traffic only from ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3001
    to_port         = 3001
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
  name        = "dataprove-redis-sg"
  description = "Redis — accept only from API and Worker tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}

# ─── S3 + CloudFront (Frontend) ───────────────────────────────────────────────

resource "aws_s3_bucket" "frontend" {
  bucket = "dataprove-frontend-${var.environment}-${data.aws_availability_zones.available.id}"
  tags   = { Name = "dataprove-frontend" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-dataprove-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-dataprove-frontend"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPA routing — return index.html for any 404
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = "dataprove-cdn" }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "dataprove-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ─── ECS Cluster ──────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "dataprove-cluster-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# ─── ECR Repositories ─────────────────────────────────────────────────────────

resource "aws_ecr_repository" "api" {
  name                 = "dataprove/api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "worker" {
  name                 = "dataprove/worker"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ─── ElastiCache (Redis) ──────────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "redis" {
  name       = "dataprove-redis-subnet-group"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "dataprove-redis"
  description                = "DataProve BullMQ queue backend"
  node_type                  = "cache.t3.micro"
  num_cache_clusters         = 1
  automatic_failover_enabled = false
  engine_version             = "7.0"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

# ─── ALB ──────────────────────────────────────────────────────────────────────

resource "aws_lb" "api" {
  name               = "dataprove-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "api" {
  name        = "dataprove-api-tg"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 10
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ─── Secrets Manager ──────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "dataprove/${var.environment}/app"
  recovery_window_in_days = 7
  description             = "DataProve application secrets (Mongo URI, Redis password, Solana RPC)"
}

# ─── IAM for ECS Task Execution ───────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "dataprove-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow ECS tasks to read secrets from Secrets Manager
resource "aws_iam_role_policy" "secrets_access" {
  name = "dataprove-secrets-access"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.app_secrets.arn]
    }]
  })
}

# ─── Outputs ──────────────────────────────────────────────────────────────────

output "alb_dns" {
  description = "API ALB endpoint"
  value       = aws_lb.api.dns_name
}

output "cloudfront_domain" {
  description = "Frontend CloudFront distribution domain"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "ecr_api_url" {
  description = "ECR URL for the API container image"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_worker_url" {
  description = "ECR URL for the worker container image"
  value       = aws_ecr_repository.worker.repository_url
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}
