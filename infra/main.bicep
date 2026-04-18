// .HMAN — Azure-native deployment.
//
// One command to spin up everything a member needs:
//   - Static Web App  (public front door + member app)
//   - Azure Relay     (Hybrid Connection for the home bridge)
//   - Key Vault       (bearer token storage, managed identity access)
//   - App Insights    (observability)
//   - DNS Zone        (member's custom domain, e.g. tailor.au)
//
// Deploy:
//   az group create --name rg-hman-prod --location australiaeast
//   az deployment group create \
//     --resource-group rg-hman-prod \
//     --template-file infra/main.bicep \
//     --parameters infra/main.bicepparam

targetScope = 'resourceGroup'

// ── Parameters ─────────────────────────────────────────────────────

@description('Short, lowercase project prefix used in resource names. E.g. "hman".')
@minLength(2)
@maxLength(8)
param projectName string = 'hman'

@description('Deployment environment. Affects resource naming and some defaults.')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'prod'

@description('Azure region. Default australiaeast for data residency.')
param location string = resourceGroup().location

@description('Your custom domain for the front door (e.g. hman.tailor.au).')
param webCustomDomain string

@description('Your custom domain for the bridge (e.g. bridge.tailor.au).')
param bridgeCustomDomain string

@description('Top-level DNS zone for the custom domains (e.g. tailor.au). Must already exist or will be created.')
param dnsZoneName string

@description('If true, create the Azure DNS zone. Set to false if zone is hosted elsewhere and you only want record sets.')
param createDnsZone bool = false

@description('Entra ID tenant id for auth. Defaults to the deploying user tenant.')
param tenantId string = subscription().tenantId

@description('Object ID of the member who will administer this deployment. Granted KeyVault access.')
param memberObjectId string

@description('Member identifier (human-readable slug for the first member).')
@minLength(2)
@maxLength(32)
param memberId string = 'member'

// ── Locals ─────────────────────────────────────────────────────────

var tags = {
  project: projectName
  environment: environment
  managedBy: 'bicep'
  repo: 'github.com/Tailor-AUS/Human-Managed-Access-Network'
}

var baseName = '${projectName}-${environment}'

// ── Log Analytics + App Insights (shared observability) ────────────

module logs 'modules/log-analytics.bicep' = {
  name: 'log-analytics'
  params: {
    name: 'log-${baseName}'
    location: location
    tags: tags
  }
}

module appInsights 'modules/app-insights.bicep' = {
  name: 'app-insights'
  params: {
    name: 'appi-${baseName}'
    location: location
    workspaceId: logs.outputs.workspaceId
    tags: tags
  }
}

// ── Key Vault (bearer token + future ed25519 keys) ─────────────────

module keyVault 'modules/key-vault.bicep' = {
  name: 'key-vault'
  params: {
    // KV names must be globally unique and <=24 chars
    name: take('kv-${projectName}-${uniqueString(resourceGroup().id)}', 24)
    location: location
    tenantId: tenantId
    memberObjectId: memberObjectId
    tags: tags
  }
}

// ── Azure Relay (Hybrid Connection for the bridge) ─────────────────

module relay 'modules/relay.bicep' = {
  name: 'relay'
  params: {
    // Relay namespace names must be globally unique
    namespaceName: 'rly-${projectName}-${uniqueString(resourceGroup().id)}'
    hybridConnectionName: '${memberId}-bridge'
    location: location
    tags: tags
  }
}

// ── Static Web App (frontend) ──────────────────────────────────────

module swa 'modules/static-web-app.bicep' = {
  name: 'static-web-app'
  params: {
    name: 'stapp-${baseName}'
    location: location
    customDomain: webCustomDomain
    appInsightsConnectionString: appInsights.outputs.connectionString
    tags: tags
  }
}

// ── DNS (optional — create zone and records) ───────────────────────

module dns 'modules/dns.bicep' = if (createDnsZone) {
  name: 'dns'
  params: {
    zoneName: dnsZoneName
    webCustomDomain: webCustomDomain
    bridgeCustomDomain: bridgeCustomDomain
    swaDefaultHostname: swa.outputs.defaultHostname
    relayNamespaceFqdn: relay.outputs.namespaceFqdn
    tags: tags
  }
}

// ── Outputs ────────────────────────────────────────────────────────

output swaName string = swa.outputs.name
output swaDefaultHostname string = swa.outputs.defaultHostname
output swaDeploymentToken string = swa.outputs.deploymentToken
output relayNamespace string = relay.outputs.namespaceName
output relayHybridConnection string = relay.outputs.hybridConnectionName
output relayListenerKeyName string = relay.outputs.listenerKeyName
output relaySenderKeyName string = relay.outputs.senderKeyName
output keyVaultName string = keyVault.outputs.name
output keyVaultUri string = keyVault.outputs.uri
output appInsightsConnectionString string = appInsights.outputs.connectionString
output webUrl string = 'https://${webCustomDomain}'
output bridgeUrl string = 'https://${bridgeCustomDomain}'
output deploymentGuide string = 'See DEPLOYMENT.md for next steps after this Bicep deployment.'
