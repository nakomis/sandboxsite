# BootBoots Web App - OTA Deployment Quick Guide

## 🚀 Quick Deployment Commands

### One-Command Deployments
```bash
# Deploy with patch version bump (bug fixes)
npm run deploy:patch

# Deploy with minor version bump (new features)
npm run deploy:minor

# Deploy with major version bump (breaking changes)
npm run deploy:major
```

### Manual Process
```bash
# 1. Update version manually
npm version patch  # or minor/major

# 2. Deploy current version
npm run deploy
```

## 📋 Pre-Deployment Checklist

- [ ] Test locally with `npm start`
- [ ] Ensure AWS CLI is configured
- [ ] Verify CloudFormation stack exists: `SandboxCloudfrontStack`
- [ ] Check current version: `npm run version:check`

## 🔧 Troubleshooting

### AWS CLI Issues
```bash
# Check AWS configuration
aws sts get-caller-identity

# Verify CloudFormation stack
aws cloudformation describe-stacks --stack-name SandboxCloudfrontStack
```

### Build Issues
```bash
# Clean node modules and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
```

### CloudFront Cache Issues
```bash
# Force cache invalidation
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## 📊 Version Strategy

- **Patch (1.0.X)**: Bug fixes, security updates
- **Minor (1.X.0)**: New features, OTA improvements
- **Major (X.0.0)**: Breaking changes, major redesigns

## 🔄 OTA Update Flow

1. **Deploy**: New version uploaded to S3
2. **Detection**: Service worker detects version change
3. **Notification**: User sees update in OTA Updates tab
4. **Installation**: One-click update with reload
5. **Verification**: User confirms new version active

## 🌐 Live URLs

- **Production**: https://sandbox.nakomis.com
- **Local Dev**: http://localhost:3000

---

**Remember**: The OTA system automatically detects new versions through service worker cache name changes. Users will see update notifications in the "OTA Updates" tab.
