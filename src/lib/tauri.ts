import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen, EventCallback, UnlistenFn } from '@tauri-apps/api/event';

// Check if we're running inside Tauri
const isTauri = '__TAURI_INTERCEPT_IPC_REQUEST__' in window || '__TAURI_IPC__' in window;

async function safeInvoke<T>(cmd: string, args?: any): Promise<T> {
  if (!isTauri) {
    throw new Error(`Tauri IPC not found. GhostCompute must be run as a desktop app (e.g., 'npm run tauri dev'), not in a standard web browser. Failed to invoke: ${cmd}`);
  }
  return tauriInvoke<T>(cmd, args);
}

export async function safeListen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  if (!isTauri) {
    throw new Error(`Tauri IPC not found. GhostCompute must be run as a desktop app. Failed to listen to: ${event}`);
  }
  return tauriListen<T>(event, handler);
}


// Types matching Rust backend structs (snake_case from serde serialization)

export interface DiscoveredPeer {
  peer_id: string;
  device_name: string;
  addresses: string[];
  port: number;
}

export interface TrustedPeer {
  peer_id: string;
  device_name: string;
  noise_public_key: string;
  paired_at: string;
  last_seen: string | null;
  revoked: boolean;
}

export type ConnectionStatus =
  | { Disconnected: null }
  | { Connecting: null }
  | { Connected: { mode: string; latency_ms: number; host_name: string } }
  | { Reconnecting: { attempt: number } };

export interface AppSettings {
  cloudflare_token: string | null;
  host_port: number;
  auto_start_hosting: boolean;
  default_model: string;
  max_concurrent_requests: number;
  max_payload_bytes: number;
  max_context_tokens: number;
  compression_enabled: boolean;
  strip_credentials: boolean;
  api_proxy_enabled: boolean;
  api_proxy_port: number;
  api_proxy_key: string | null;
}

export type OllamaStatus = 'NotInstalled' | 'Stopped' | 'Running';

export interface ModelInfo {
  name: string;
  size: number;
  modified_at: string;
}

export interface SessionInfo {
  peer_id: string;
  device_name: string;
  connected_at: string;
  active: boolean;
}

export type PairingState =
  | 'Idle'
  | 'Discovering'
  | { AwaitingConfirmation: { sas: string; peer_id: string; device_name: string } }
  | { Completed: { peer_id: string } }
  | { Failed: { reason: string } };

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatChunk {
  message: ChatMessage | null;
  done: boolean;
}

export interface PullProgress {
  status: string;
  total: number | null;
  completed: number | null;
}

export interface IdentityInfo {
  peer_id: string;
  device_name: string;
}

// Discovery
export const getDiscoveredPeers = () => safeInvoke<DiscoveredPeer[]>('get_discovered_peers');
export const startDiscovery = () => safeInvoke<void>('start_discovery');
export const stopDiscovery = () => safeInvoke<void>('stop_discovery');

// Pairing
export const initiatePairing = (peer_id: string) => safeInvoke<void>('initiate_pairing', { peer_id });
export const confirmPairing = (confirmed: boolean) => safeInvoke<void>('confirm_pairing', { confirmed });
export const generatePairingCode = () => safeInvoke<string>('generate_pairing_code');
export const submitPairingCode = (code: string) => safeInvoke<boolean>('submit_pairing_code', { code });
export const generatePairingLink = () => safeInvoke<string>('generate_pairing_link');
export const connectToUrl = (url: string) => safeInvoke<void>('connect_to_url', { url });
export const getPairingState = () => safeInvoke<PairingState>('get_pairing_state');

// Devices
export const getPairedDevices = () => safeInvoke<TrustedPeer[]>('get_paired_devices');
export const revokeDevice = (peer_id: string) => safeInvoke<void>('revoke_device', { peer_id });
export const removeDevice = (peer_id: string) => safeInvoke<void>('remove_device', { peer_id });

// Connection
export const connectToHost = (peer_id: string) => safeInvoke<void>('connect_to_host', { peer_id });
export const disconnectFromHost = () => safeInvoke<void>('disconnect_from_host');
export const sendChatMessage = (message: string) => safeInvoke<void>('send_chat_message', { message });
export const getConnectionStatus = () => safeInvoke<ConnectionStatus>('get_connection_status');
export const getAvailableModels = () => safeInvoke<ModelInfo[]>('get_available_models');
export const getRemoteModels = () => safeInvoke<string[]>('get_remote_models');

// Hosting
export const startHosting = () => safeInvoke<void>('start_hosting');
export const stopHosting = () => safeInvoke<void>('stop_hosting');
export const getActiveSessions = () => safeInvoke<SessionInfo[]>('get_active_sessions');
export const killSession = (peer_id: string) => safeInvoke<void>('kill_session', { peer_id });
export const killAllSessions = () => safeInvoke<void>('kill_all_sessions');

// Ollama
export const getOllamaStatus = () => safeInvoke<OllamaStatus>('get_ollama_status');
export const pullModel = (name: string) => safeInvoke<void>('pull_model', { name });
export const swapModel = (name: string) => safeInvoke<void>('swap_model', { name });

// Identity
export const getIdentityInfo = () => safeInvoke<IdentityInfo>('get_identity_info');

// Settings
export const getSettings = () => safeInvoke<AppSettings>('get_settings');
export const saveSettings = (settings: AppSettings) => safeInvoke<void>('save_settings', { settings });

// API Proxy
export interface ApiProxyStatus {
  running: boolean;
  port: number;
  endpoint: string;
}

export const startApiProxy = () => safeInvoke<void>('start_api_proxy');
export const stopApiProxy = () => safeInvoke<void>('stop_api_proxy');
export const getApiProxyStatus = () => safeInvoke<ApiProxyStatus>('get_api_proxy_status');

export { isTauri };
