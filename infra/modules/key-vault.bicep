@description('Key Vault name (must be globally unique, <=24 chars).')
@maxLength(24)
param name string

@description('Azure region.')
param location string

@description('Entra ID tenant id.')
param tenantId string

@description('Object id of the member. Gets full access.')
param memberObjectId string

@description('Tags.')
param tags object

resource kv 'Microsoft.KeyVault/vaults@2024-04-01-preview' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Grant the member Key Vault Secrets Officer role on the vault
var kvSecretsOfficer = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(memberObjectId)) {
  name: guid(kv.id, memberObjectId, kvSecretsOfficer)
  scope: kv
  properties: {
    principalId: memberObjectId
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', kvSecretsOfficer)
    principalType: 'User'
  }
}

output id string = kv.id
output name string = kv.name
output uri string = kv.properties.vaultUri
