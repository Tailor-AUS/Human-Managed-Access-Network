// Azure Static Web Apps hosting for the .HMAN web dashboard.
//
// Free tier includes:
//   - Custom domain with auto-managed cert
//   - Global CDN
//   - 100 GB bandwidth/month
//   - 2 custom domains
//   - Built-in auth (Entra ID, GitHub, etc.)

@description('Static Web App resource name.')
param name string

@description('Azure region (limited set for SWA — eastasia, eastus2, centralus, westeurope, westus2).')
@allowed([
  'eastasia'
  'eastus2'
  'centralus'
  'westeurope'
  'westus2'
])
param location string = 'eastasia'

@description('Custom domain (e.g. hman.tailor.au). DNS records must be created separately.')
param customDomain string

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
    // No GitHub integration here — we use manual deploy via Wrangler/swa-cli
    // so GitHub Actions controls the build. Leaves repositoryUrl empty.
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

// Bind the custom domain. Record creation happens in the DNS module
// (separate because DNS may live outside Azure).
resource customDomainBinding 'Microsoft.Web/staticSites/customDomains@2023-12-01' = if (!empty(customDomain)) {
  parent: swa
  name: customDomain
  properties: {
    validationMethod: 'cname-delegation'
  }
}

output id string = swa.id
output name string = swa.name
output defaultHostname string = swa.properties.defaultHostname
#disable-next-line outputs-should-not-contain-secrets
output deploymentToken string = listSecrets(swa.id, '2023-12-01').properties.apiKey
