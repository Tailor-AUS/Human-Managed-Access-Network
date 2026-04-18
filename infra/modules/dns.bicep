// Azure DNS records for the frontend + bridge hostnames.
//
// Creates the apex zone only if createDnsZone = true (handled in main.bicep).
// This module always creates the CNAME records for the SWA and Relay endpoints.

@description('Top-level DNS zone name (e.g. tailor.au).')
param zoneName string

@description('Full custom domain for the frontend (e.g. hman.tailor.au).')
param webCustomDomain string

@description('Full custom domain for the bridge (e.g. bridge.tailor.au).')
param bridgeCustomDomain string

@description('SWA default hostname to point webCustomDomain at.')
param swaDefaultHostname string

@description('Relay namespace FQDN (e.g. rly-hman-xyz.servicebus.windows.net).')
param relayNamespaceFqdn string

@description('Tags.')
param tags object

// Ensure the zone exists (idempotent — if it already exists at the same
// resource group, this ARM update is a no-op).
resource zone 'Microsoft.Network/dnsZones@2023-07-01-preview' = {
  name: zoneName
  location: 'global'
  tags: tags
  properties: {
    zoneType: 'Public'
  }
}

// Derive just the label part of each FQDN
var webLabel = replace(webCustomDomain, '.${zoneName}', '')
var bridgeLabel = replace(bridgeCustomDomain, '.${zoneName}', '')

// Web front end → SWA
resource webCname 'Microsoft.Network/dnsZones/CNAME@2023-07-01-preview' = {
  parent: zone
  name: webLabel
  properties: {
    TTL: 3600
    CNAMERecord: {
      cname: swaDefaultHostname
    }
  }
}

// Bridge → Relay (note: the actual bridge is reachable via the Relay
// namespace, not directly. This CNAME is here for clarity if you later
// front the Relay with APIM or Azure Front Door. For direct Relay use,
// clients call the namespace FQDN with a Hybrid Connection path).
resource bridgeCname 'Microsoft.Network/dnsZones/CNAME@2023-07-01-preview' = {
  parent: zone
  name: bridgeLabel
  properties: {
    TTL: 3600
    CNAMERecord: {
      cname: relayNamespaceFqdn
    }
  }
}

output webCnameFqdn string = '${webCname.name}.${zone.name}'
output bridgeCnameFqdn string = '${bridgeCname.name}.${zone.name}'
output zoneName string = zone.name
