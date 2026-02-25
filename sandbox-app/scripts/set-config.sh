#!/bin/bash

# This script is intended to set the configuration for the Nakomis sandbox web application.
# It should be run before the build process to ensure that the application has the correct settings.

function setValue() {
    local key="$1"
    local value="$2"
    echo "Setting $key to $value"
    local file="$SCRIPT_DIR/../src/config/config.json"
    sed -i.bk "s|\"$key\": \".*\"|\"$key\": \"$value\"|g" "$file"
}

PARAM=$1
ENV="${PARAM:=sandbox}"

if [[ $ENV == "localhost" ]]; then
    export AWS_ENV=sandbox
else
    export AWS_ENV=$ENV
fi

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
export AWS_PROFILE=nakom.is-$AWS_ENV

rm -rf $SCRIPT_DIR/../src/config/config.json
cp $SCRIPT_DIR/../src/config/config.json.template $SCRIPT_DIR/../src/config/config.json

setValue env $ENV

setValue region $(aws configure get region)

USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 | jq -r '.UserPools[] | select(.Name == "SandboxUserPool") | .Id')

setValue authority "https://cognito-idp.eu-west-2.amazonaws.com/"$USER_POOL_ID

setValue userPoolId $USER_POOL_ID

USER_POOL_CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id $USER_POOL_ID | jq -r '.UserPoolClients[] | select(.ClientName == "SandboxUserPoolClient") | .ClientId')

setValue userPoolClientId $USER_POOL_CLIENT_ID

case $ENV in
    sandbox)
        setValue redirectUri "https://sandbox.nakomis.com/loggedin"
        setValue logoutUri "https://sandbox.nakomis.com/logout"
        setValue cognitoDomain "auth0.sandbox.nakomis.com"
        ;;
    localhost)
        setValue redirectUri "http://localhost:3000/loggedin"
        setValue logoutUri "http://localhost:3000/logout"
        setValue cognitoDomain "auth0.sandbox.nakomis.com"
        ;;
    *)
        echo "Unknown environment: $ENV"
        exit 1
        ;;
esac

IDENTITY_POOL_ID=$(aws cognito-identity list-identity-pools --max-results 60 | jq -r '.IdentityPools[] | select(.IdentityPoolName == "SandboxIdentityPool") | .IdentityPoolId')

setValue identityPoolId $IDENTITY_POOL_ID

# BootBoots images bucket (training images)
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
setValue imagesBucket "bootboots-images-${AWS_ACCOUNT_ID}-${AWS_REGION}"

# PCB Printer save/load resources
PCB_PRINTER_BUCKET=$(aws cloudformation describe-stacks --stack-name SandboxPcbPrinterStack --query "Stacks[0].Outputs[?OutputKey=='PcbPrinterBucketName'].OutputValue" --output text)
setValue bucket "$PCB_PRINTER_BUCKET"

PCB_PRINTER_TABLE=$(aws cloudformation describe-stacks --stack-name SandboxPcbPrinterStack --query "Stacks[0].Outputs[?OutputKey=='PcbPrinterTableName'].OutputValue" --output text)
setValue table "$PCB_PRINTER_TABLE"

rm -f $SCRIPT_DIR/../src/config/config.json.bk
