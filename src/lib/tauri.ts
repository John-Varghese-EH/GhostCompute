import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen, EventCallback, UnlistenFn } from '@tauri-apps/api/event';

async function safeInvoke<T>(cmd: string, args?: any): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

export async function safeListen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  return tauriListen<T>(event, handler);
}

// Types matching Rust backend structs

export interface DiscoveredPeer {
  peer_id: string;
  device_name: string;
  addresses: string[];
  port: number;
}

export type UserRole = 'admin' | 'developer' | 'viewer';

export interface TrustedPeer {
  peer_id: string;
  device_name: string;
  noise_public_key: string;
  paired_at: string;
  last_seen: string | null;
  revoked: boolean;
  role: UserRole;
  api_token?: string | null;
  rate_limit_rpm: number;
}

export type ConnectionStatus =
  | { Disconnected: null }
  | { Connecting: null }
  | { Connected: { mode: string; latency_ms: number; host_name: string } }
  | { Reconnecting: { attempt: number } };

export interface AppSettings {
  cloudflare_token: string | null;
  cloudflare_tunnel_url: string | null;
  gemini_api_key: string | null;
  groq_api_key: string | null;
  host_port: number;
  auto_start_hosting: boolean;
  default_model: string | null;
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

export interface SystemStats {
  cpu_usage_percent: number;
  total_memory_mb: number;
  used_memory_mb: number;
  total_swap_mb: number;
  used_swap_mb: number;
  uptime_seconds: number;
  os_name: string;
  host_name: string;
  gpu_name?: string | null;
  gpu_vram_total_mb?: number | null;
  gpu_vram_used_mb?: number | null;
  gpu_temp_celsius?: number | null;
}

// Docker & Hardware
export interface DockerStatus {
  installed: boolean;
  running: boolean;
  version: string | null;
  compose_available: boolean;
}

export interface GpuInfo {
  vendor: string;
  name: string;
  vram_mb: number;
  driver_version?: string | null;
  cuda_version?: string | null;
  nvidia_docker: boolean;
}

// Service Recipes (16 tools)
export type ToolCategory =
  | 'llm_engine'
  | 'ai_chat'
  | 'media_generation'
  | 'workflow_automation'
  | 'coding_assistant';

export type DeploymentMethod = 'docker_compose' | 'native_binary' | 'docker_run';

export interface ExposedPort {
  container_port: number;
  host_port: number;
  protocol: string;
  description: string;
}

export interface ServiceRecipe {
  id: string;
  name: string;
  description: string;
  version: string;
  category: ToolCategory;
  deployment: DeploymentMethod;
  docker_image?: string | null;
  ports: ExposedPort[];
  gpu: {
    required: boolean;
    recommended_vram_mb: number;
    nvidia_runtime: boolean;
    rocm_support: boolean;
  };
  depends_on: string[];
  web_ui: boolean;
  web_ui_path?: string | null;
  documentation_url: string;
}

export type ServiceStatus =
  | 'not_installed'
  | 'installed'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'updating';

export interface ServiceState {
  recipe_id: string;
  status: ServiceStatus;
  container_id?: string | null;
  tunnel_url?: string | null;
  last_health_check?: string | null;
  error_message?: string | null;
  installed_at?: string | null;
  started_at?: string | null;
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

// Devices & RBAC
export const getPairedDevices = () => safeInvoke<TrustedPeer[]>('get_paired_devices');
export const revokeDevice = (peer_id: string) => safeInvoke<void>('revoke_device', { peer_id });
export const removeDevice = (peer_id: string) => safeInvoke<void>('remove_device', { peer_id });
export const updatePeerRole = (peer_id: string, role: string, rate_limit_rpm: number) =>
  safeInvoke<void>('update_peer_role', { peer_id, role, rate_limit_rpm });
export const generatePeerApiToken = (peer_id: string) =>
  safeInvoke<string>('generate_peer_api_token', { peer_id });

// Connection
export const connectToHost = (peer_id: string) => safeInvoke<void>('connect_to_host', { peer_id });
export const disconnectFromHost = () => safeInvoke<void>('disconnect_from_host');
export const sendChatMessage = (message: string) => safeInvoke<void>('send_chat_message', { message });
export const getConnectionStatus = () => safeInvoke<ConnectionStatus>('get_connection_status');
export const getAvailableModels = () => safeInvoke<ModelInfo[]>('get_available_models');
export const getRemoteModels = () => safeInvoke<string[]>('get_remote_models');

// Hosting
export const startHosting = () => safeInvoke<void>('start_hosting');
export const isHosting = () => safeInvoke<boolean>('is_hosting');
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

// API Proxy & Telemetry
export interface ApiProxyStatus {
  running: boolean;
  port: number;
  endpoint: string;
}

export const startApiProxy = () => safeInvoke<void>('start_api_proxy');
export const stopApiProxy = () => safeInvoke<void>('stop_api_proxy');
export const getApiProxyStatus = () => safeInvoke<ApiProxyStatus>('get_api_proxy_status');
export const getHostSysStats = () => safeInvoke<SystemStats>('get_host_sys_stats');
export const getLocalIp = () => safeInvoke<string>('get_local_ip');

// Docker & GPU
export const getDockerStatus = () => safeInvoke<DockerStatus>('get_docker_status');
export const detectGpuHardware = () => safeInvoke<GpuInfo>('detect_gpu_hardware');

// Orchestrator Catalog (16 tools)
export const listRecipes = () => safeInvoke<ServiceRecipe[]>('list_recipes');
export const getServiceStates = () => safeInvoke<ServiceState[]>('get_service_states');
export const installAndRunService = (recipe_id: string) =>
  safeInvoke<void>('install_and_run_service', { recipe_id });
export const stopService = (recipe_id: string) =>
  safeInvoke<void>('stop_service', { recipe_id });
export const refreshServiceStatus = (recipe_id: string) =>
  safeInvoke<ServiceState>('refresh_service_status', { recipe_id });
export const getServiceLogs = (recipe_id: string, tail: number = 100) =>
  safeInvoke<string>('get_service_logs', { recipe_id, tail });
export const checkServiceHealth = (endpoint: string, timeout_secs: number = 3) =>
  safeInvoke<boolean>('check_service_health', { endpoint, timeout_secs });

export const isTauri = true;
