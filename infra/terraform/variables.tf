variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "environment must be one of: development, staging, production"
  }
}

variable "api_image_tag" {
  description = "Docker image tag to deploy for the API container (e.g. git SHA)"
  type        = string
  default     = "latest"
}

variable "worker_image_tag" {
  description = "Docker image tag to deploy for the worker container"
  type        = string
  default     = "latest"
}

variable "api_desired_count" {
  description = "Desired number of running API ECS task instances"
  type        = number
  default     = 2
}

variable "api_cpu" {
  description = "CPU units for each API ECS task (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memory (MB) for each API ECS task"
  type        = number
  default     = 1024
}
