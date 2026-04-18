// Parameter file for main.bicep.
// Edit the values below for your deployment.
//
// Use:
//   az deployment group create \
//     --resource-group rg-hman-prod \
//     --template-file infra/main.bicep \
//     --parameters infra/main.bicepparam

using 'main.bicep'

param projectName = 'hman'
param environment = 'prod'

// ── Your custom domain ────────────────────────────────────────────
// Change these to match the domain you own. DNS zone must exist
// either in Azure DNS (set createDnsZone = true) or elsewhere (set
// createDnsZone = false and add records yourself).
param webCustomDomain = 'hman.tailor.au'
param bridgeCustomDomain = 'bridge.tailor.au'
param dnsZoneName = 'tailor.au'
param createDnsZone = false

// ── Identity ──────────────────────────────────────────────────────
// Your Entra ID object id. Get it with:
//   az ad signed-in-user show --query id -o tsv
// Leave tenantId empty to use the current subscription's tenant.
param memberObjectId = ''

// Human-friendly identifier for the first member on this deployment.
// Used to name the Hybrid Connection (e.g. "knox-bridge").
param memberId = 'member'
