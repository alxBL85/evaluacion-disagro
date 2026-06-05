#!/bin/sh
set -e

echo "Creating LocalStack queue sales-notifications..."
awslocal sqs create-queue --queue-name sales-notifications || true
