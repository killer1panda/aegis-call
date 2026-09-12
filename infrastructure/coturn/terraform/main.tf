terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "Target AWS region for Coturn relay deployment"
}

variable "turn_shared_secret" {
  type        = string
  sensitive   = true
  description = "Ephemeral HMAC-SHA1 shared secret for RFC 5766 TURN authentication"
}

provider "aws" {
  region = variable.aws_region
}

resource "aws_security_group" "coturn_sg" {
  name        = "aegis-coturn-sg"
  description = "Allow inbound STUN/TURN traffic and outbound media relay"

  # Standard STUN/TURN UDP & TCP
  ingress {
    description = "STUN/TURN UDP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "STUN/TURN TCP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # TURNS TLS
  ingress {
    description = "TURNS TLS TCP"
    from_port   = 5349
    to_port     = 5349
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Dynamic UDP Relay Port Range
  ingress {
    description = "TURN UDP Relay Media Range"
    from_port   = 49152
    to_port     = 65535
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

output "security_group_id" {
  value = aws_security_group.coturn_sg.id
}
