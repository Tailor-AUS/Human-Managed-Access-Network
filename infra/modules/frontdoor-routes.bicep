// Phase 2 — attach hman.example.com + bridge.example.com to an existing
// Azure Front Door profile. Run AFTER:
//   1. Phase 1 (main.bicep) has provisioned SWA + Relay
//   2. DNS TXT records for _dnsauth.<hostname> are in place at your DNS
//      provider (Front Door validation tokens are printed as outputs the
//      first time you run this — validation eventually flips to Approved)
//
// This module targets the resource group where the Front Door profile
// lives, NOT the .HMAN resource group. Deploy like:
//
//   az deployment group create \
//     --resource-group <front-door-resource-group> \
//     --template-file infra/modules/frontdoor-routes.bicep \
//     --parameters frontDoorProfileName=<your-afd-profile> \
//                  frontDoorEndpointName=<your-afd-endpoint> \
//                  swaDefaultHostname=<from phase 1 outputs> \
//                  relayNamespaceFqdn=<from phase 1 outputs> \
//                  hybridConnectionName=<from phase 1 outputs> \
//                  webCustomDomain=hman.example.com \
//                  bridgeCustomDomain=bridge.example.com

targetScope = 'resourceGroup'

@description('Existing Azure Front Door profile name.')
param frontDoorProfileName string

@description('Existing AFD endpoint name (under the profile).')
param frontDoorEndpointName string

@description('SWA default hostname (e.g. polite-field-xxx.azurestaticapps.net).')
param swaDefaultHostname string

@description('Relay namespace FQDN (e.g. rly-hman-xxx.servicebus.windows.net).')
param relayNamespaceFqdn string

@description('Hybrid Connection name (Relay path segment).')
param hybridConnectionName string

@description('Public hostname for the frontend (e.g. hman.example.com).')
param webCustomDomain string

@description('Public hostname for the bridge (e.g. bridge.example.com).')
param bridgeCustomDomain string

// ── References to existing Front Door ──────────────────────────────

resource profile 'Microsoft.Cdn/profiles@2024-02-01' existing = {
  name: frontDoorProfileName
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-02-01' existing = {
  parent: profile
  name: frontDoorEndpointName
}

// ── Custom domains ─────────────────────────────────────────────────

resource webDomain 'Microsoft.Cdn/profiles/customDomains@2024-02-01' = {
  parent: profile
  name: replace(webCustomDomain, '.', '-')
  properties: {
    hostName: webCustomDomain
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
  }
}

resource bridgeDomain 'Microsoft.Cdn/profiles/customDomains@2024-02-01' = {
  parent: profile
  name: replace(bridgeCustomDomain, '.', '-')
  properties: {
    hostName: bridgeCustomDomain
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
  }
}

// ── Origin group: SWA ──────────────────────────────────────────────

resource swaOriginGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: profile
  name: 'hman-swa-og'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/'
      probeProtocol: 'Https'
      probeRequestType: 'HEAD'
      probeIntervalInSeconds: 100
    }
    sessionAffinityState: 'Disabled'
  }
}

resource swaOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: swaOriginGroup
  name: 'hman-swa'
  properties: {
    hostName: swaDefaultHostname
    httpsPort: 443
    originHostHeader: swaDefaultHostname
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

// ── Origin group: Relay bridge ─────────────────────────────────────

resource relayOriginGroup 'Microsoft.Cdn/profiles/originGroups@2024-02-01' = {
  parent: profile
  name: 'hman-relay-og'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 100
    }
    healthProbeSettings: {
      // Relay endpoint responds with 404 to unauthenticated GETs at the
      // namespace root — we probe the health endpoint that goes through
      // to the local bridge. If the bridge is offline, FD marks unhealthy.
      probePath: '/${hybridConnectionName}/api/health'
      probeProtocol: 'Https'
      probeRequestType: 'GET'
      probeIntervalInSeconds: 240
    }
    sessionAffinityState: 'Disabled'
  }
}

resource relayOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2024-02-01' = {
  parent: relayOriginGroup
  name: 'hman-relay'
  properties: {
    hostName: relayNamespaceFqdn
    httpsPort: 443
    originHostHeader: relayNamespaceFqdn
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

// ── Routes ─────────────────────────────────────────────────────────

resource swaRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: endpoint
  name: 'hman-web-route'
  properties: {
    customDomains: [
      {
        id: webDomain.id
      }
    ]
    originGroup: {
      id: swaOriginGroup.id
    }
    ruleSets: []
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Disabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
  }
  dependsOn: [
    swaOrigin
  ]
}

resource bridgeRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2024-02-01' = {
  parent: endpoint
  name: 'hman-bridge-route'
  properties: {
    customDomains: [
      {
        id: bridgeDomain.id
      }
    ]
    originGroup: {
      id: relayOriginGroup.id
    }
    ruleSets: []
    supportedProtocols: [
      'Http'
      'Https'
    ]
    // Rewrite so incoming requests to bridge.example.com/api/xxx get
    // forwarded to the Relay as /<hybrid-connection>/api/xxx
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Disabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
  }
  dependsOn: [
    relayOrigin
  ]
}

// ── Outputs ────────────────────────────────────────────────────────

output webCustomDomainValidationToken string = webDomain.properties.validationProperties.validationToken
output bridgeCustomDomainValidationToken string = bridgeDomain.properties.validationProperties.validationToken
output webCustomDomainState string = webDomain.properties.domainValidationState
output bridgeCustomDomainState string = bridgeDomain.properties.domainValidationState
