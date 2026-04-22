// Azure Static Web Apps hosting for the .HMAN web dashboard.
//
// Free tier includes:
//   - 100 GB bandwidth/month
//   - 2 custom domains (not bound here — handle via Front Door in Phase 2)
//   - Default *.azurestaticapps.net hostname with auto HTTPS
//   - Global CDN
//   - Built-in auth (Entra ID, GitHub, etc.)
//
// This module deliberately does NOT bind a custom domain. Route the
// hostname via Azure Front Door (or any fronting CDN) — run
// infra/modules/frontdoor-routes.bicep once DNS TXT validation is
// sorted to wire hman.<your-domain> through your Front Door profile.

@description('Static Web App resource name.')
param name string

@description('Azure region (limited to SWA-supported regions).')
@allowed([
  'eastasia'
  'eastus2'
  'centralus'
  'westeurope'
  'westus2'
])
param location string = 'eastasia'

@description('App Insights connection string, wired through app settings.')
param appInsightsConnectionString string

@description('Tags.')
param tags object

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

resource swaSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  }
}

output id string = swa.id
output name string = swa.name
output defaultHostname string = swa.properties.defaultHostname
#disable-next-line outputs-should-not-contain-secrets
output deploymentToken string = swa.listSecrets().properties.apiKey
