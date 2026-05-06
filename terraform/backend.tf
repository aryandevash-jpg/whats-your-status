terraform {
  backend "s3" {
    bucket  = "whats-your-status-tf-state-859993703623"
    key     = "whats-your-status/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true
  }
}
