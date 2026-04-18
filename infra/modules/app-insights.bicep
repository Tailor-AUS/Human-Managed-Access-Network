@description('Application Insights resource name.')
param name string

@description('Azure region.')
param location string

@description('Linked Log Analytics workspace id.')
param workspaceId string

@description('Tags.')
param tags object

resource ai 'Microsoft.Insights/components@2020-02-02' = {
  name: name
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspaceId
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output id string = ai.id
output name string = ai.name
output connectionString string = ai.properties.ConnectionString
output instrumentationKey string = ai.properties.InstrumentationKey
