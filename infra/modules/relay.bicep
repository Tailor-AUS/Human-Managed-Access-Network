// Azure Relay Hybrid Connection for the .HMAN bridge.
//
// Creates:
//   - Relay namespace (standard tier — required for Hybrid Connections)
//   - Hybrid Connection (the "tunnel endpoint")
//   - Two authorisation rules:
//       * listener — used by the home desktop to receive incoming requests
//       * sender   — used by Azure (or any caller) to push requests through

@description('Azure Relay namespace name (globally unique).')
param namespaceName string

@description('Hybrid Connection name (path after the namespace).')
param hybridConnectionName string

@description('Azure region.')
param location string

@description('Tags.')
param tags object

resource ns 'Microsoft.Relay/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
  }
}

resource hc 'Microsoft.Relay/namespaces/hybridConnections@2024-01-01' = {
  parent: ns
  name: hybridConnectionName
  properties: {
    requiresClientAuthorization: true
    userMetadata: 'HMAN bridge hybrid connection — home desktop listens, web frontend sends.'
  }
}

resource listenerKey 'Microsoft.Relay/namespaces/hybridConnections/authorizationRules@2024-01-01' = {
  parent: hc
  name: 'listener'
  properties: {
    rights: [
      'Listen'
    ]
  }
}

resource senderKey 'Microsoft.Relay/namespaces/hybridConnections/authorizationRules@2024-01-01' = {
  parent: hc
  name: 'sender'
  properties: {
    rights: [
      'Send'
    ]
  }
}

output namespaceName string = ns.name
output namespaceFqdn string = '${ns.name}.servicebus.windows.net'
output hybridConnectionName string = hc.name
output hybridConnectionPath string = '${ns.name}/${hc.name}'
output listenerKeyName string = listenerKey.name
output senderKeyName string = senderKey.name
