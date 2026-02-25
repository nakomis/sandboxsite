#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
REPO_DIR="$(dirname "$APP_DIR")"

# --- Parse flags ---
BUMP="patch"
for arg in "$@"; do
  case "$arg" in
    --major) BUMP="major" ;;
    --minor) BUMP="minor" ;;
  esac
done

# --- Read current version ---
VERSION_FILE="$APP_DIR/src/version.json"
CURRENT_VERSION=$(node -e "process.stdout.write(require('$VERSION_FILE').version)")

# Strip -SNAPSHOT suffix
RELEASE_VERSION="${CURRENT_VERSION%-SNAPSHOT}"
if [[ "$RELEASE_VERSION" == "$CURRENT_VERSION" ]]; then
  echo "ERROR: version in version.json is not a SNAPSHOT version: $CURRENT_VERSION"
  exit 1
fi

# Parse semver parts
IFS='.' read -r MAJOR MINOR PATCH <<< "$RELEASE_VERSION"

echo "Preparing release: sandbox/$RELEASE_VERSION"

# --- Check pcbprinter is not a SNAPSHOT ---
PCBPRINTER_VERSION=$(node -e "process.stdout.write(require('$APP_DIR/node_modules/pcbprinter/package.json').version)")
if [[ "$PCBPRINTER_VERSION" == *-SNAPSHOT ]]; then
  echo "WARNING: pcbprinter is a SNAPSHOT version ($PCBPRINTER_VERSION). Refusing to deploy."
  echo "Run 'npm install' in sandbox-app after releasing pcbprinter."
  exit 1
fi

# --- Check git status ---
cd "$REPO_DIR"
if ! git diff --quiet || ! git diff --cached --quiet; then
  read -r -p "Uncommitted changes found. Abort? [Y/n] " REPLY
  REPLY="${REPLY:-Y}"
  if [[ "$REPLY" =~ ^[Yy]$ ]]; then
    echo "Aborting."
    exit 1
  fi
fi

# --- Stamp release version ---
echo "{ \"version\": \"$RELEASE_VERSION\" }" > "$VERSION_FILE"

# --- Build ---
echo "Building sandbox-app..."
cd "$APP_DIR"
AWS_PROFILE=nakom.is-sandbox ./scripts/set-config.sh sandbox
npm install
npm run build

# --- Commit and tag ---
cd "$REPO_DIR"
git add "$VERSION_FILE"
git commit -m "Release sandbox/$RELEASE_VERSION"
git tag "sandbox/$RELEASE_VERSION"

# --- Deploy to S3 / CloudFront ---
BUCKET_NAME=$(aws cloudformation describe-stacks --stack-name SandboxCloudfrontStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SandboxSiteBucketName`].OutputValue' --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name SandboxCloudfrontStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SandboxSiteDistributionId`].OutputValue' --output text)

if [ -z "$BUCKET_NAME" ] || [ -z "$DISTRIBUTION_ID" ]; then
  echo "ERROR: Could not retrieve AWS resources from CloudFormation"
  exit 1
fi

echo "Syncing to s3://$BUCKET_NAME..."
aws s3 sync "$APP_DIR/build/" "s3://$BUCKET_NAME" --delete

echo "Setting cache headers..."
aws s3 cp "$APP_DIR/build/static/" "s3://$BUCKET_NAME/static/" --recursive \
  --cache-control "max-age=31536000" --metadata-directive REPLACE
aws s3 cp "$APP_DIR/build/index.html" "s3://$BUCKET_NAME/index.html" \
  --cache-control "max-age=300" --metadata-directive REPLACE

if [ -f "$APP_DIR/build/sw.js" ]; then
  aws s3 cp "$APP_DIR/build/sw.js" "s3://$BUCKET_NAME/sw.js" \
    --cache-control "max-age=0, no-cache, no-store, must-revalidate" --metadata-directive REPLACE
fi

echo "Invalidating CloudFront..."
INVALIDATION_ID=$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION_ID" --id "$INVALIDATION_ID"

# --- Compute next SNAPSHOT ---
case "$BUMP" in
  major) NEXT_VERSION="$((MAJOR + 1)).0.0-SNAPSHOT" ;;
  minor) NEXT_VERSION="${MAJOR}.$((MINOR + 1)).0-SNAPSHOT" ;;
  *)     NEXT_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))-SNAPSHOT" ;;
esac

# --- Bump to next SNAPSHOT ---
echo "{ \"version\": \"$NEXT_VERSION\" }" > "$VERSION_FILE"
git add "$VERSION_FILE"
git commit -m "Bump sandbox to $NEXT_VERSION"

# --- Push ---
git push && git push --tags

echo "Deploy complete! Released sandbox/$RELEASE_VERSION, next: $NEXT_VERSION"
