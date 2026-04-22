// .HMAN — Azure-native deployment.
//
// One command to spin up everything a member needs:
//   - Static Web App   (public front door + member app)
//   - Azure Relay      (Hybrid Connection for the home bridge)
//   - Key Vault        (bearer token storage, managed identity access)
//   - App Insights     (observability)
//
// Deployed in two phases to dodge the DNS/custom-domain chicken-and-egg:
//
//   Phase 1 (this template, default):
//     Provision infra. Frontend uses SWA's default *.azurestaticapps.net
//     hostname. Bridge uses Relay's namespace FQDN. Both public HTTPS.
//     Everything works immediately.
//
//   Phase 2 (optional):
//     Once you've added DNS TXT records for validation, re-run with
//     bindCustomDomains = true to attach hman.example.com / bridge.example.com
//     via your existing Front Door profile (see frontdoor-routes.bicep).

targetScope = 'resourceGroup'

// ── Parameters ─────────────────────────────────────────────────────

@description('Short, lowercase project prefix used in resource names.')
@minLength(2)
@maxLength(8)
param projectName string = 'hman'

@description('Deployment environment.')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'prod'

@description('Azure region for non-SWA resources. Default australiaeast.')
param location string = resourceGroup().location

@description('Entra ID tenant id. Defaults to the subscription tenant.')
param tenantId string = subscription().tenantId

@description('Object ID of the member who deploys. Granted Key Vault Secrets Officer.')
param memberObjectId string

@description('Human-readable slug for the first member. Names the Hybrid Connection.')
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

// ── Log Analytics + App Insights ───────────────────────────────────

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

// ── Key Vault ──────────────────────────────────────────────────────

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

// ── Azure Relay ────────────────────────────────────────────────────

module relay 'modules/relay.bicep' = {
  name: 'relay'
  params: {
    namespaceName: 'rly-${projectName}-${uniqueString(resourceGroup().id)}'
    hybridConnectionName: '${memberId}-bridge'
    location: location
    tags: tags
  }
}

// ── Static Web App ─────────────────────────────────────────────────

module swa 'modules/static-web-app.bicep' = {
  name: 'static-web-app'
  params: {
    name: 'stapp-${baseName}'
    // SWA doesn't support australiaeast — use eastasia as the nearest valid
    location: 'eastasia'
    appInsightsConnectionString: appInsights.outputs.connectionString
    tags: tags
  }
}

// ── Outputs ────────────────────────────────────────────────────────

output swaName string = swa.outputs.name
output swaDefaultHostname string = swa.outputs.defaultHostname
#disable-next-line outputs-should-not-contain-secrets
output swaDeploymentToken string = swa.outputs.deploymentToken

output relayNamespace string = relay.outputs.namespaceName
output relayNamespaceFqdn string = relay.outputs.namespaceFqdn
output relayHybridConnection string = relay.outputs.hybridConnectionName
output relayHybridConnectionPath string = relay.outputs.hybridConnectionPath

output keyVaultName string = keyVault.outputs.name
output keyVaultUri string = keyVault.outputs.uri

output appInsightsConnectionString string = appInsights.outputs.connectionString
output logAnalyticsWorkspaceId string = logs.outputs.workspaceId

// Member-facing convenience outputs
output memberFrontendUrl string = 'https://${swa.outputs.defaultHostname}'
output memberBridgeUrl string = 'https://${relay.outputs.namespaceFqdn}/${relay.outputs.hybridConnectionName}'
