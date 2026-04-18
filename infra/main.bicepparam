// Parameter file for main.bicep.
// Phase 1: provisions SWA + Relay + KV + App Insights. No DNS work.
//
// Use:
//   az deployment group create \
//     --resource-group rg-hman-prod \
//     --template-file infra/main.bicep \
//     --parameters infra/main.bicepparam

using 'main.bicep'

param projectName = 'hman'
param environment = 'prod'

// Your Entra ID object id. Get it with:
//   az ad signed-in-user show --query id -o tsv
// Populated by azure-deploy.ps1 at runtime — set here if running bicep directly.
param memberObjectId = ''

// Human-friendly identifier for the first member on this deployment.
// Becomes the Hybrid Connection name, e.g. "member-bridge".
param memberId = 'member'
