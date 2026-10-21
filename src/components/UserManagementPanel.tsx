import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Key, 
  Trash2, 
  Plus, 
  Copy, 
  Check, 
  Gauge, 
  RefreshCw,
  Laptop
} from 'lucide-react';
import { 
  getPairedDevices, 
  revokeDevice, 
  removeDevice, 
  updatePeerRole, 
  generatePeerApiToken, 
  generatePairingLink, 
  TrustedPeer, 
  UserRole 
} from '../lib/tauri';
import { Badge } from './common/Badge';
import { Button } from './common/Button';
import { IconBadge } from './common/IconBadge';

export const UserManagementPanel: React.FC = () => {
  const [peers, setPeers] = useState<TrustedPeer[]>([]);
  const [pairingLink, setPairingLink] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const loadPeers = async () => {
    try {
      const list = await getPairedDevices();
      setPeers(list);
    } catch (e) {
      console.error('Failed to load peers:', e);
    }
  };

  useEffect(() => {
    loadPeers();
  }, []);

  const handleGenerateLink = async () => {
    try {
      const link = await generatePairingLink();
      setPairingLink(link);
    } catch (e) {
      alert(`Failed to generate pairing link: ${e}`);
    }
  };

  const handleRoleChange = async (peerId: string, newRole: UserRole, currentRpm: number) => {
    try {
      await updatePeerRole(peerId, newRole, currentRpm);
      await loadPeers();
    } catch (e) {
      alert(`Failed to update role: ${e}`);
    }
  };

  const handleRateLimitChange = async (peerId: string, currentRole: UserRole, newRpm: number) => {
    try {
      await updatePeerRole(peerId, currentRole, newRpm);
      await loadPeers();
    } catch (e) {
      alert(`Failed to update rate limit: ${e}`);
    }
  };

  const handleGenerateToken = async (peerId: string) => {
    try {
      const token = await generatePeerApiToken(peerId);
      navigator.clipboard.writeText(token);
      setCopiedToken(peerId);
      setTimeout(() => setCopiedToken(null), 2500);
      await loadPeers();
    } catch (e) {
      alert(`Failed to generate token: ${e}`);
    }
  };

  const handleRevoke = async (peerId: string) => {
    try {
      await revokeDevice(peerId);
      await loadPeers();
    } catch (e) {
      alert(`Failed to revoke peer: ${e}`);
    }
  };

  const handleRemove = async (peerId: string) => {
    if (!confirm('Are you sure you want to completely remove this client?')) return;
    try {
      await removeDevice(peerId);
      await loadPeers();
    } catch (e) {
      alert(`Failed to remove peer: ${e}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--gc-text)] flex items-center gap-2">
            <Users size={20} className="text-accent" />
            <span>Multi-User & Access Control (RBAC)</span>
          </h2>
          <p className="text-sm text-[var(--gc-text-muted)] mt-1">
            Manage authenticated client devices, assign roles (Admin, Developer, Viewer), and configure API tokens.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={loadPeers} className="flex items-center gap-1.5 text-[var(--gc-text)]">
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={handleGenerateLink} className="flex items-center gap-1.5">
            <Plus size={14} /> Generate Client Token
          </Button>
        </div>
      </div>

      {/* Generated Token Banner */}
      {pairingLink && (
        <div className="double-bezel">
          <div className="double-bezel-inner bg-[var(--gc-accent-muted)] border-[var(--gc-accent)] flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-accent uppercase tracking-wider flex items-center gap-1.5">
              <Key size={13} className="text-accent" />
              <span>One-Click Client Invitation Link (Encrypted Token + Tunnel):</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={pairingLink}
                className="flex-1 bg-[var(--gc-surface-sunken)] border border-[var(--gc-border)] rounded-xl px-3.5 py-2 text-xs font-mono text-[var(--gc-text)] select-all focus:outline-none"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  navigator.clipboard.writeText(pairingLink);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="flex items-center gap-1.5 text-xs px-4 py-2"
              >
                {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
              </Button>
            </div>
            <div className="text-[11px] text-[var(--gc-text-muted)]">
              Securely encodes the Cloudflare Tunnel URL and cryptographic Noise pairing secret.
            </div>
          </div>
        </div>
      )}

      {/* Peer List Table (Double-Bezel Architecture) */}
      <div className="double-bezel">
        <div className="double-bezel-inner p-0 overflow-hidden">
          {peers.length === 0 ? (
            <div className="p-16 text-center text-[var(--gc-text-muted)]">
              <ShieldCheck size={36} className="mx-auto mb-3 opacity-40 text-accent" />
              <div className="text-sm font-semibold text-[var(--gc-text)]">No paired client devices connected</div>
              <div className="text-xs text-[var(--gc-text-muted)] mt-1">Generate a pairing link above to invite remote client laptops.</div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--gc-border)]">
            {peers.map(peer => {
              const isCopied = copiedToken === peer.peer_id;
              return (
                <div key={peer.peer_id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-[var(--gc-surface-elevated)] transition-colors">
                  <div className="flex items-center gap-3">
                    <IconBadge 
                      icon={<Laptop size={18} />} 
                      variant={peer.role === 'admin' ? 'rose' : peer.role === 'developer' ? 'accent' : 'neutral'} 
                      size="md" 
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--gc-text)] text-sm">{peer.device_name}</span>
                        <Badge variant={peer.revoked ? 'danger' : 'success'}>
                          {peer.revoked ? 'Revoked' : 'Active'}
                        </Badge>
                      </div>
                      <div className="text-xs text-[var(--gc-text-muted)] font-mono mt-0.5">
                        ID: {peer.peer_id.substring(0, 12)}...
                      </div>
                    </div>
                  </div>

                  {/* Role & Rate Limit Controls */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Role selector */}
                    <div className="flex items-center gap-1.5 bg-[var(--gc-surface-sunken)] px-2.5 py-1 rounded-lg border border-[var(--gc-border)]">
                      <span className="text-[11px] text-[var(--gc-text-muted)] uppercase font-mono">Role:</span>
                      <select
                        value={peer.role}
                        onChange={e => handleRoleChange(peer.peer_id, e.target.value as UserRole, peer.rate_limit_rpm)}
                        className="bg-transparent text-xs text-[var(--gc-text)] font-medium focus:outline-none"
                      >
                        <option value="developer" className="bg-[var(--gc-surface)] text-[var(--gc-text)]">Developer</option>
                        <option value="admin" className="bg-[var(--gc-surface)] text-[var(--gc-text)]">Admin</option>
                        <option value="viewer" className="bg-[var(--gc-surface)] text-[var(--gc-text)]">Viewer</option>
                      </select>
                    </div>

                    {/* Rate limit */}
                    <div className="flex items-center gap-1.5 bg-[var(--gc-surface-sunken)] px-2.5 py-1 rounded-lg border border-[var(--gc-border)]">
                      <Gauge size={12} className="text-[var(--gc-text-muted)]" />
                      <span className="text-[11px] text-[var(--gc-text-muted)] font-mono">RPM:</span>
                      <input
                        type="number"
                        min="1"
                        max="600"
                        value={peer.rate_limit_rpm}
                        onChange={e => handleRateLimitChange(peer.peer_id, peer.role, parseInt(e.target.value) || 60)}
                        className="w-12 bg-transparent text-xs text-[var(--gc-text)] font-mono focus:outline-none"
                      />
                    </div>

                    {/* API Token button */}
                    <button
                      onClick={() => handleGenerateToken(peer.peer_id)}
                      title={peer.api_token ? `Token: ${peer.api_token}` : 'Generate Bearer API Token'}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--gc-surface-elevated)] hover:bg-[var(--gc-border)] border border-[var(--gc-border)] text-xs text-[var(--gc-text)] font-mono transition-colors cursor-pointer"
                    >
                      <Key size={12} className={peer.api_token ? 'text-amber-400' : 'text-[var(--gc-text-muted)]'} />
                      <span>{isCopied ? 'Copied!' : peer.api_token ? 'Copy Token' : 'New Token'}</span>
                    </button>

                    {/* Revoke / Remove */}
                    <div className="flex items-center gap-1">
                      {!peer.revoked && (
                        <Button size="sm" variant="ghost" onClick={() => handleRevoke(peer.peer_id)} className="text-xs text-amber-400 hover:text-amber-300">
                          Revoke
                        </Button>
                      )}
                      <button
                        onClick={() => handleRemove(peer.peer_id)}
                        title="Remove device"
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-[var(--gc-text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
