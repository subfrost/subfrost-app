# CI/CD Setup Guide

This guide explains how to configure GitHub Actions and Google Cloud Platform for continuous integration and deployment of the Subfrost application.

## Overview

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  GitHub Push    │ ──▶  │  GitHub Actions  │ ──▶  │   Cloud Run     │
│  (main branch)  │      │  (Build & Test)  │      │   (Deploy)      │
└─────────────────┘      └──────────────────┘      └─────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Artifact Registry│
                         │ (Docker Images)  │
                         └──────────────────┘
```

## Prerequisites

1. A GCP project with billing enabled
2. GitHub repository with admin access
3. `gcloud` CLI installed locally

---

## Step 1: GCP Project Setup

### 1.1 Set Environment Variables

```bash
export GCP_PROJECT_ID="your-project-id"  # Your project ID
export GCP_PROJECT_NUMBER=$(gcloud projects describe $GCP_PROJECT_ID --format="value(projectNumber)")
export REGION="us-central1"
```

### 1.2 Enable Required APIs

```bash
gcloud config set project $GCP_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com \
  iam.googleapis.com
```

### 1.3 Create Artifact Registry Repository

```bash
gcloud artifacts repositories create docker-images \
  --repository-format=docker \
  --location=$REGION \
  --description="Docker images for Subfrost"
```

---

## Step 2: Workload Identity Federation (Recommended)

Workload Identity Federation allows GitHub Actions to authenticate to GCP without storing service account keys.

### 2.1 Create Workload Identity Pool

```bash
gcloud iam workload-identity-pools create "github-pool" \
  --project="$GCP_PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

### 2.2 Create Workload Identity Provider

Replace `YOUR_GITHUB_ORG` with your GitHub organization or username:

```bash
GITHUB_ORG="YOUR_GITHUB_ORG"

gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="$GCP_PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == '${GITHUB_ORG}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

### 2.3 Create Service Account for GitHub Actions

```bash
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Service Account"
```

### 2.4 Grant Permissions to Service Account

```bash
SA_EMAIL="github-actions@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

# Cloud Run Admin
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

# Artifact Registry Writer
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer"

# Service Account User (to deploy Cloud Run)
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"
```

### 2.5 Allow GitHub to Impersonate Service Account

Replace `YOUR_GITHUB_ORG` and `YOUR_REPO` with your values:

```bash
GITHUB_ORG="YOUR_GITHUB_ORG"  # e.g., "sandshrewmetaprotocols"
GITHUB_REPO="YOUR_REPO"       # e.g., "subfrost-app"

gcloud iam service-accounts add-iam-policy-binding \
  "github-actions@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --project="$GCP_PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}"
```

### 2.6 Get WIF Provider Resource Name

```bash
echo "WIF_PROVIDER: projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
echo "WIF_SERVICE_ACCOUNT: github-actions@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
```

---

## Step 3: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `GCP_PROJECT_ID` | `your-project-id` | Your GCP project ID |
| `WIF_PROVIDER` | `projects/123.../providers/github-provider` | From step 2.6 |
| `WIF_SERVICE_ACCOUNT` | `github-actions@....iam.gserviceaccount.com` | From step 2.6 |
| `CLOUDFLARE_API_TOKEN` | Your API token | Token with DNS edit permissions (see below) |

### Cloudflare API Token

The deployment automatically updates Cloudflare DNS to point `app.subfrost.io` to Cloud Run.

Create a Cloudflare API token at https://dash.cloudflare.com/profile/api-tokens with these permissions:

| Permission | Access |
|------------|--------|
| Zone → Zone | Read |
| Zone → DNS | Edit |

Zone Resources: Include → Specific zone → `subfrost.io`

### Alternative: Service Account Key (Less Secure)

If you can't use Workload Identity Federation:

```bash
# Create key file
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@${GCP_PROJECT_ID}.iam.gserviceaccount.com

# Copy contents to GitHub secret GCP_SA_KEY
cat key.json

# Delete local key
rm key.json
```

Then update `.github/workflows/deploy.yml` to use `credentials_json` instead of `workload_identity_provider`.

---

## Step 4: Test the Pipeline

1. Push a commit to the `main` branch
2. Go to GitHub → Actions tab
3. Watch the CI workflow run
4. On success, the Deploy workflow will automatically deploy to Cloud Run

---

## Workflow Summary

### CI Workflow (`.github/workflows/ci.yml`)
- **Triggers:** Push to `main`/`develop`, Pull Requests to `main`
- **Jobs:**
  - Lint & Type Check
  - Unit Tests
  - Build Next.js app
  - Test Docker build

### Deploy Workflow (`.github/workflows/deploy.yml`)
- **Triggers:** Push to `main`, Manual dispatch
- **Jobs:**
  - Build & push Docker image to Artifact Registry
  - Deploy to Cloud Run
  - Update Cloudflare DNS (optional)

### Preview Workflow (`.github/workflows/preview.yml`)
- **Triggers:** Pull Request opened/updated/closed
- **Jobs:**
  - Deploy preview environment for PR
  - Cleanup on PR close

---

## Alternative: Cloud Build

You can also use Google Cloud Build instead of GitHub Actions. The `cloudbuild.yaml` file is provided for this purpose.

### Set up Cloud Build Trigger

```bash
# Connect your GitHub repository to Cloud Build
gcloud builds triggers create github \
  --repo-name="subfrost-app" \
  --repo-owner="YOUR_GITHUB_ORG" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --name="deploy-on-push"
```

---

## Troubleshooting

### "Permission denied" errors

Check that the service account has all required roles:
```bash
gcloud projects get-iam-policy $GCP_PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:github-actions@" \
  --format="table(bindings.role)"
```

### "Workload Identity Federation" errors

Verify the attribute mapping:
```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --project="$GCP_PROJECT_ID"
```

### Cloud Run deployment fails

Check Cloud Run logs:
```bash
gcloud run services logs read subfrost-app --region=$REGION --limit=50
```

### Docker build fails

Test locally:
```bash
docker build -t subfrost-app:test .
docker run -p 3000:3000 subfrost-app:test
```

---

## Cost Optimization

1. **Cloud Run:** Set `--min-instances 0` for scale-to-zero (already configured)
2. **Artifact Registry:** Set lifecycle policies to delete old images:
   ```bash
   gcloud artifacts repositories set-cleanup-policies docker-images \
     --location=$REGION \
     --policy=keep-last-5-versions
   ```

---

## Environment Variables

The following environment variables are set during deployment:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `NEXT_PUBLIC_NETWORK` | `mainnet` | Network configuration |
| `PORT` | `3000` | Server port |
