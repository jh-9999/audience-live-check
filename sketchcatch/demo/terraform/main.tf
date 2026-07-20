terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

output "static_site_url" {
  value = "https://${aws_cloudfront_distribution.cdn_web.domain_name}"
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.cdn_web.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.cdn_web.domain_name
}

output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.cdn_web.domain_name}"
}

output "static_site_bucket_name" {
  value = aws_s3_bucket.bucket_web_assets.bucket
}

output "static_bucket_name" {
  value = aws_s3_bucket.bucket_web_assets.bucket
}

output "ecr_repository_url" {
  value = aws_ecr_repository.ecr_api_image.repository_url
}

output "ecr_repository_name" {
  value = aws_ecr_repository.ecr_api_image.name
}

output "ecr_repository_arn" {
  value = aws_ecr_repository.ecr_api_image.arn
}

output "ecs_task_family" {
  value = aws_ecs_task_definition.task_fixed_template_fargate_container_app.family
}

output "ecs_task_definition_family" {
  value = aws_ecs_task_definition.task_fixed_template_fargate_container_app.family
}

output "ecs_task_definition_arn" {
  value = aws_ecs_task_definition.task_fixed_template_fargate_container_app.arn
}

output "ecs_task_role_arn" {
  value = aws_ecs_task_definition.task_fixed_template_fargate_container_app.task_role_arn
}

output "ecs_execution_role_arn" {
  value = aws_ecs_task_definition.task_fixed_template_fargate_container_app.execution_role_arn
}

output "log_group_names" {
  value = [aws_cloudwatch_log_group.logs_ecs.name]
}

output "api_base_url" {
  value = "https://${aws_cloudfront_distribution.cdn_web.domain_name}"
}

output "api_origin_url" {
  value = "http://${aws_lb.alb_fixed_template_ecs_fargate_container_app.dns_name}"
}

output "alb_arn" {
  value = aws_lb.alb_fixed_template_ecs_fargate_container_app.arn
}

output "alb_dns_name" {
  value = aws_lb.alb_fixed_template_ecs_fargate_container_app.dns_name
}

output "target_group_arn" {
  value = aws_lb_target_group.tg_fixed_template_ecs_fargate_container_app.arn
}

output "alb_arn_suffix" {
  value = aws_lb.alb_fixed_template_ecs_fargate_container_app.arn_suffix
}

output "target_group_arn_suffix" {
  value = aws_lb_target_group.tg_fixed_template_ecs_fargate_container_app.arn_suffix
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.ecs_cluster_fixed_template_fargate_container_app.name
}

output "ecs_service_name" {
  value = aws_ecs_service.ecs_service_fixed_template_fargate_container_app.name
}

output "ecs_container_name" {
  value = "api"
}

output "ecs_container_port" {
  value = 8080
}

output "max_capacity" {
  value = aws_appautoscaling_target.ecs_service_requests.max_capacity
}

resource "aws_vpc" "vpc_fixed_template_ecs_fargate_container_app" {
  cidr_block           = "10.30.0.0/16"
  instance_tenancy     = "default"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "subnet_fixed_template_ecs_fargate_container_app_a" {
  vpc_id                  = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
  cidr_block              = "10.30.1.0/24"
  availability_zone       = "ap-northeast-2a"
  map_public_ip_on_launch = true
}

resource "aws_subnet" "subnet_fixed_template_ecs_fargate_container_app_b" {
  vpc_id                  = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
  cidr_block              = "10.30.2.0/24"
  availability_zone       = "ap-northeast-2b"
  map_public_ip_on_launch = true
}

resource "aws_internet_gateway" "igw_fixed_template_ecs_fargate_container_app" {
  vpc_id = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
}

resource "aws_route_table" "rt_fixed_template_ecs_fargate_container_app" {
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw_fixed_template_ecs_fargate_container_app.id
  }
  vpc_id = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
}

resource "aws_route_table_association" "rta_fixed_template_ecs_fargate_container_app_a" {
  subnet_id      = aws_subnet.subnet_fixed_template_ecs_fargate_container_app_a.id
  route_table_id = aws_route_table.rt_fixed_template_ecs_fargate_container_app.id
}

resource "aws_route_table_association" "rta_fixed_template_ecs_fargate_container_app_b" {
  subnet_id      = aws_subnet.subnet_fixed_template_ecs_fargate_container_app_b.id
  route_table_id = aws_route_table.rt_fixed_template_ecs_fargate_container_app.id
}

resource "aws_ecs_cluster" "ecs_cluster_fixed_template_fargate_container_app" {
  name = "audience-live-check-cluster"
}

resource "aws_security_group" "sg_fixed_template_ecs_fargate_container_app_alb" {
  name   = "audience-live-check-alb-sg"
  vpc_id = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
  egress {
    to_port   = 0
    from_port = 0
    protocol  = "-1"
    cidr_blocks = [
      "0.0.0.0/0",
    ]
  }
  ingress {
    to_port   = 80
    from_port = 80
    protocol  = "tcp"
    cidr_blocks = [
      "0.0.0.0/0",
    ]
  }
  description = "Allow CloudFront origin HTTP while CloudFront terminates public TLS"
}

resource "aws_security_group" "sg_fixed_template_ecs_fargate_container_app_task" {
  name   = "audience-live-check-task-sg"
  vpc_id = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
  egress {
    to_port   = 0
    from_port = 0
    protocol  = "-1"
    cidr_blocks = [
      "0.0.0.0/0",
    ]
  }
  ingress {
    to_port   = 8080
    from_port = 8080
    protocol  = "tcp"
    security_groups = [
      aws_security_group.sg_fixed_template_ecs_fargate_container_app_alb.id,
    ]
  }
  description = "Allow ALB traffic to the API on port 8080"
}

resource "aws_iam_role" "role_fixed_template_ecs_fargate_container_app_execution" {
  name               = "audience-live-check-ecs-execution"
  assume_role_policy = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
}

resource "aws_iam_role_policy_attachment" "fixed_template_ecs_fargate_container_app_execution_policy" {
  role       = aws_iam_role.role_fixed_template_ecs_fargate_container_app_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "role_fixed_template_ecs_fargate_container_app_task" {
  name               = "audience-live-check-ecs-task"
  assume_role_policy = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
}

resource "aws_lb" "alb_fixed_template_ecs_fargate_container_app" {
  name = "audience-live-check-alb"
  subnets = [
    aws_subnet.subnet_fixed_template_ecs_fargate_container_app_a.id,
    aws_subnet.subnet_fixed_template_ecs_fargate_container_app_b.id,
  ]
  security_groups = [
    aws_security_group.sg_fixed_template_ecs_fargate_container_app_alb.id,
  ]
  load_balancer_type = "application"
}

resource "aws_lb_target_group" "tg_fixed_template_ecs_fargate_container_app" {
  name        = "audience-live-check-api"
  port        = 8080
  vpc_id      = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
  protocol    = "HTTP"
  target_type = "ip"
  health_check {
    path    = "/health"
    matcher = "200-399"
  }
}

resource "aws_lb_listener" "listener_fixed_template_ecs_fargate_container_app" {
  port     = 80
  protocol = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg_fixed_template_ecs_fargate_container_app.arn
  }
  load_balancer_arn = aws_lb.alb_fixed_template_ecs_fargate_container_app.arn
}

resource "aws_ecs_task_definition" "task_fixed_template_fargate_container_app" {
  cpu    = 256
  family = "audience-live-check-api"
  memory = 512
  depends_on = [
    aws_cloudwatch_log_group.logs_ecs,
    aws_secretsmanager_secret_version.check_in_signing,
    aws_iam_role_policy.check_in_signing_read,
  ]
  network_mode          = "awsvpc"
  task_role_arn         = aws_iam_role.role_fixed_template_ecs_fargate_container_app_task.arn
  execution_role_arn    = aws_iam_role.role_fixed_template_ecs_fargate_container_app_execution.arn
  container_definitions = "[{\"name\":\"api\",\"image\":\"public.ecr.aws/docker/library/nginx:1.27-alpine\",\"essential\":true,\"entryPoint\":[\"/bin/sh\",\"-c\"],\"command\":[\"printf '%s\\\\n' 'server {' '  listen 8080;' '  default_type text/plain;' '  location = /health { return 200 ok; }' '  location / { return 200 SketchCatch-deployment-smoke; }' '}' > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'\"],\"portMappings\":[{\"containerPort\":8080,\"hostPort\":8080,\"protocol\":\"tcp\"}],\"environment\":[{\"name\":\"PORT\",\"value\":\"8080\"},{\"name\":\"WEB_ORIGIN\",\"value\":\"https://${aws_cloudfront_distribution.cdn_web.domain_name}\"},{\"name\":\"INSTANCE_ID\",\"value\":\"fargate\"}],\"logConfiguration\":{\"logDriver\":\"awslogs\",\"options\":{\"awslogs-group\":\"/ecs/audience-live-check-api\",\"awslogs-region\":\"ap-northeast-2\",\"awslogs-stream-prefix\":\"api\"}},\"secrets\":[{\"name\":\"CHECK_IN_SIGNING_SECRET\",\"valueFrom\":\"${aws_secretsmanager_secret.check_in_signing.arn}\"}]}]"
  requires_compatibilities = [
    "FARGATE",
  ]
}

resource "aws_ecs_service" "ecs_service_fixed_template_fargate_container_app" {
  name    = "audience-live-check-service"
  cluster = aws_ecs_cluster.ecs_cluster_fixed_template_fargate_container_app.id
  depends_on = [
    aws_lb_listener.listener_fixed_template_ecs_fargate_container_app,
  ]
  launch_type   = "FARGATE"
  desired_count = 1
  load_balancer {
    container_name   = "api"
    container_port   = 8080
    target_group_arn = aws_lb_target_group.tg_fixed_template_ecs_fargate_container_app.arn
  }
  task_definition = aws_ecs_task_definition.task_fixed_template_fargate_container_app.arn
  network_configuration {
    subnets = [
      aws_subnet.subnet_private_app_a.id,
      aws_subnet.subnet_private_app_b.id,
    ]
    assign_public_ip = false
    security_groups = [
      aws_security_group.sg_fixed_template_ecs_fargate_container_app_task.id,
    ]
  }
  health_check_grace_period_seconds = 30

  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_appautoscaling_target" "ecs_service_requests" {
  min_capacity = 1
  max_capacity = 2

  resource_id = "service/${aws_ecs_cluster.ecs_cluster_fixed_template_fargate_container_app.name}/${aws_ecs_service.ecs_service_fixed_template_fargate_container_app.name}"

  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_service_requests" {
  name        = "audience-live-check-request-scaling"
  policy_type = "TargetTrackingScaling"

  resource_id        = aws_appautoscaling_target.ecs_service_requests.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service_requests.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service_requests.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 10
    scale_out_cooldown = 30
    scale_in_cooldown  = 300

    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.alb_fixed_template_ecs_fargate_container_app.arn_suffix}/${aws_lb_target_group.tg_fixed_template_ecs_fargate_container_app.arn_suffix}"
    }
  }
}

resource "aws_subnet" "subnet_private_app_a" {
  vpc_id                  = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
  cidr_block              = "10.30.11.0/24"
  availability_zone       = "ap-northeast-2a"
  map_public_ip_on_launch = false
}

resource "aws_subnet" "subnet_private_app_b" {
  vpc_id                  = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
  cidr_block              = "10.30.12.0/24"
  availability_zone       = "ap-northeast-2b"
  map_public_ip_on_launch = false
}

resource "aws_eip" "eip_nat" {
  domain = "vpc"
}

resource "aws_nat_gateway" "nat_private_egress" {
  subnet_id     = aws_subnet.subnet_fixed_template_ecs_fargate_container_app_a.id
  allocation_id = aws_eip.eip_nat.id
}

resource "aws_route_table" "rt_private_app" {
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat_private_egress.id
  }
  vpc_id = aws_vpc.vpc_fixed_template_ecs_fargate_container_app.id
}

resource "aws_route_table_association" "rta_private_app_a" {
  subnet_id      = aws_subnet.subnet_private_app_a.id
  route_table_id = aws_route_table.rt_private_app.id
}

resource "aws_route_table_association" "rta_private_app_b" {
  subnet_id      = aws_subnet.subnet_private_app_b.id
  route_table_id = aws_route_table.rt_private_app.id
}

resource "aws_s3_bucket" "bucket_web_assets" {
  bucket_prefix = "audience-live-check-web-"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "bucket_web_assets_versioning" {
  bucket = aws_s3_bucket.bucket_web_assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "web_public_access" {
  bucket                  = aws_s3_bucket.bucket_web_assets.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_object" "web_bootstrap_index" {
  key          = "index.html"
  bucket       = aws_s3_bucket.bucket_web_assets.id
  content      = "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Application deployment ready</title><body><main><h1>Application deployment ready</h1><p>GitHub Actions will replace this bootstrap document with apps/web/dist.</p></main></body></html>"
  content_type = "text/html; charset=utf-8"
  lifecycle {
    ignore_changes = [content, content_type, cache_control, etag, source]
  }
}

resource "aws_cloudfront_origin_access_control" "web_oac" {
  name                              = "audience-live-check-web-oac"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
  origin_access_control_origin_type = "s3"
}

resource "aws_cloudfront_distribution" "cdn_web" {
  origin {
    origin_id                = "web-assets"
    domain_name              = aws_s3_bucket.bucket_web_assets.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web_oac.id
  }
  origin {
    origin_id   = "api-alb"
    domain_name = aws_lb.alb_fixed_template_ecs_fargate_container_app.dns_name
    custom_origin_config {
      http_port  = 80
      https_port = 443
      origin_ssl_protocols = [
        "TLSv1.2",
      ]
      origin_protocol_policy = "http-only"
    }
  }
  enabled     = true
  price_class = "PriceClass_100"
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  default_root_object = "index.html"
  viewer_certificate {
    cloudfront_default_certificate = true
  }
  default_cache_behavior {
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    cached_methods = [
      "GET",
      "HEAD",
    ]
    allowed_methods = [
      "GET",
      "HEAD",
    ]
    target_origin_id       = "web-assets"
    viewer_protocol_policy = "redirect-to-https"
  }
  ordered_cache_behavior {
    path_pattern    = "/api/*"
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    cached_methods = [
      "GET",
      "HEAD",
    ]
    allowed_methods = [
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
    ]
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "redirect-to-https"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }
  ordered_cache_behavior {
    path_pattern    = "/health"
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    cached_methods = [
      "GET",
      "HEAD",
    ]
    allowed_methods = [
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
    ]
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "redirect-to-https"
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }
}

resource "aws_s3_bucket_policy" "web_cloudfront_read" {
  bucket = aws_s3_bucket.bucket_web_assets.id
  policy = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowCloudFrontServicePrincipalReadOnly\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cloudfront.amazonaws.com\"},\"Action\":\"s3:GetObject\",\"Resource\":\"${aws_s3_bucket.bucket_web_assets.arn}/*\",\"Condition\":{\"StringEquals\":{\"AWS:SourceArn\":\"${aws_cloudfront_distribution.cdn_web.arn}\"}}}]}"
  depends_on = [
    aws_s3_bucket_public_access_block.web_public_access,
  ]
}

resource "aws_ecr_repository" "ecr_api_image" {
  name                 = "audience-live-check-api"
  force_delete         = true
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_cloudwatch_log_group" "logs_ecs" {
  name              = "/ecs/audience-live-check-api"
  retention_in_days = 30
}

resource "random_password" "check_in_signing" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "check_in_signing" {
  name_prefix               = "audience-live-check/check-in-signing-"
  recovery_window_in_days   = 0
}

resource "aws_secretsmanager_secret_version" "check_in_signing" {
  secret_id     = aws_secretsmanager_secret.check_in_signing.id
  secret_string = random_password.check_in_signing.result
}

resource "aws_iam_role_policy" "check_in_signing_read" {
  name   = "audience-live-check-check-in-signing-read"
  role   = aws_iam_role.role_fixed_template_ecs_fargate_container_app_execution.id
  policy = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"ReadCheckInSigningSecret\",\"Effect\":\"Allow\",\"Action\":[\"secretsmanager:GetSecretValue\"],\"Resource\":\"${aws_secretsmanager_secret.check_in_signing.arn}\"}]}"
}