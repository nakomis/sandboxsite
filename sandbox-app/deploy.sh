#!/bin/bash
set -e

echo "🚀 Starting BootBoots Web App Deployment..."

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📦 Current version: $CURRENT_VERSION"

# Build production version
echo "🔨 Building production version..."
npm run build

# Get AWS resources from CloudFormation
echo "🔍 Getting AWS resources from CloudFormation..."
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name SandboxCloudfrontStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SandboxSiteBucketName`].OutputValue' --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name SandboxCloudfrontStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SandboxSiteDistributionId`].OutputValue' --output text)

if [ -z "$BUCKET_NAME" ] || [ -z "$DISTRIBUTION_ID" ]; then
    echo "❌ Error: Could not retrieve AWS resources from CloudFormation"
    echo "   Make sure SandboxCloudfrontStack is deployed and you have AWS CLI configured"
    exit 1
fi

echo "📡 Deploying to S3 bucket: $BUCKET_NAME"
echo "🌐 CloudFront distribution: $DISTRIBUTION_ID"

# Sync files to S3
echo "📤 Syncing files to S3..."
aws s3 sync ./build/ s3://$BUCKET_NAME --delete

# Set cache headers for optimal performance
echo "⚡ Setting cache headers..."
aws s3 cp ./build/static/ s3://$BUCKET_NAME/static/ --recursive \
  --cache-control "max-age=31536000" --metadata-directive REPLACE

# Set short cache for index.html to enable quick updates
aws s3 cp ./build/index.html s3://$BUCKET_NAME/index.html \
  --cache-control "max-age=300" --metadata-directive REPLACE

# Set cache for service worker (short cache for updates)
if [ -f "./build/sw.js" ]; then
    aws s3 cp ./build/sw.js s3://$BUCKET_NAME/sw.js \
      --cache-control "max-age=0, no-cache, no-store, must-revalidate" --metadata-directive REPLACE
    echo "🔧 Service worker cache headers updated"
fi

# Invalidate CloudFront
echo "🌐 Invalidating CloudFront distribution..."
INVALIDATION_ID=$(aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*" \
  --query 'Invalidation.Id' --output text)

echo "⏳ Waiting for CloudFront invalidation to complete..."
aws cloudfront wait invalidation-completed --distribution-id $DISTRIBUTION_ID --id $INVALIDATION_ID

echo "✅ Deployment complete! Version $CURRENT_VERSION is now live."
echo "🔗 URL: https://sandbox.nakomis.com"
echo "🔄 OTA updates will be detected automatically by existing users"
echo ""
echo "📊 Deployment Summary:"
echo "   Version: $CURRENT_VERSION"
echo "   S3 Bucket: $BUCKET_NAME"
echo "   CloudFront: $DISTRIBUTION_ID"
echo "   Invalidation: $INVALIDATION_ID"
