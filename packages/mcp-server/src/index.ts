/**
 * @hman/mcp-server - HMAN Gate MCP Server
 *
 * This package provides the MCP server implementation for HMAN,
 * enabling secure, human-controlled AI access to personal data.
 */

export { HmanGate, createHmanGate, type HmanGateConfig } from './server.js';

// Re-export core types for convenience
export {
  type AccessRequest,
  type AccessResponse,
  type RequesterInfo,
  PermissionLevel,
} from '@hman/core';
