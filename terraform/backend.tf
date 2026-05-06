# Remote state (optional). Create the bucket and (recommended) a DynamoDB lock table first.
# Then: terraform init -migrate-state
#
# terraform {
#   backend "s3" {
#     bucket         = "YOUR_UNIQUE_TF_STATE_BUCKET"
#     key            = "whats-your-status/terraform.tfstate"
#     region         = "us-east-1"
#     encrypt        = true
#     dynamodb_table = "terraform-locks"
#   }
# }
