use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use std::collections::HashMap;
use std::thread;
use thiserror::Error;
use tokio::sync::mpsc;

pub const SERVICE_TYPE: &str = "_ghostcompute._tcp.local.";
#[allow(dead_code)]
pub const DEFAULT_PORT: u16 = 8384;

#[derive(Debug, Error)]
pub enum DiscoveryError {
    #[error("mDNS error: {0}")]
    Mdns(String),
    #[error("Already advertising a service")]
    AlreadyAdvertising,
}

impl From<mdns_sd::Error> for DiscoveryError {
    fn from(err: mdns_sd::Error) -> Self {
        DiscoveryError::Mdns(err.to_string())
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct DiscoveredPeer {
    pub peer_id: String,
    pub device_name: String,
    pub addresses: Vec<String>,
    pub port: u16,
}

pub enum DiscoveryEvent {
    PeerFound(DiscoveredPeer),
    PeerLost(String),
}

pub struct MdnsHandle {
    daemon: ServiceDaemon,
    service_fullname: Option<String>,
    is_browsing: bool,
}

impl MdnsHandle {
    pub fn new() -> Result<Self, DiscoveryError> {
        let daemon = ServiceDaemon::new()?;
        Ok(Self {
            daemon,
            service_fullname: None,
            is_browsing: false,
        })
    }

    pub fn start_advertising(
        &mut self,
        peer_id: &str,
        device_name: &str,
        port: u16,
    ) -> Result<(), DiscoveryError> {
        if self.service_fullname.is_some() {
            return Err(DiscoveryError::AlreadyAdvertising);
        }

        let mut properties = HashMap::new();
        properties.insert("peer_id".to_string(), peer_id.to_string());
        properties.insert("version".to_string(), "0.1.0".to_string());
        properties.insert("device_name".to_string(), device_name.to_string());

        let host_name = format!("{}.local.", device_name.replace(' ', "-").to_lowercase());

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            device_name,
            &host_name,
            "",
            port,
            Some(properties),
        )?
        .enable_addr_auto();

        self.service_fullname = Some(service_info.get_fullname().to_string());
        self.daemon.register(service_info)?;

        Ok(())
    }

    pub fn stop_advertising(&mut self) -> Result<(), DiscoveryError> {
        if let Some(fullname) = self.service_fullname.take() {
            self.daemon.unregister(&fullname)?;
        }
        Ok(())
    }

    pub fn browse_peers(
        &mut self,
        own_peer_id: String,
    ) -> Result<mpsc::Receiver<DiscoveryEvent>, DiscoveryError> {
        let receiver = self.daemon.browse(SERVICE_TYPE)?;
        self.is_browsing = true;
        let (tx, rx) = mpsc::channel(32);

        thread::spawn(move || {
            let mut known_peers = HashMap::new();

            while let Ok(event) = receiver.recv() {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        if let Some(pid) = info.get_property_val_str("peer_id") {
                            if pid != own_peer_id {
                                let device_name = info
                                    .get_property_val_str("device_name")
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| info.get_fullname().to_string());

                                let addresses = info
                                    .get_addresses()
                                    .iter()
                                    .map(|ip| ip.to_string())
                                    .collect();

                                let peer = DiscoveredPeer {
                                    peer_id: pid.to_string(),
                                    device_name,
                                    addresses,
                                    port: info.get_port(),
                                };

                                known_peers
                                    .insert(info.get_fullname().to_string(), pid.to_string());

                                if tx.blocking_send(DiscoveryEvent::PeerFound(peer)).is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    ServiceEvent::ServiceRemoved(_ty, fullname) => {
                        if let Some(pid) = known_peers.remove(&fullname) {
                            if tx.blocking_send(DiscoveryEvent::PeerLost(pid)).is_err() {
                                break;
                            }
                        }
                    }
                    _ => {}
                }
            }
        });

        Ok(rx)
    }

    pub fn stop_browsing(&mut self) -> Result<(), DiscoveryError> {
        if self.is_browsing {
            let _ = self.daemon.stop_browse(SERVICE_TYPE);
            self.is_browsing = false;
        }
        Ok(())
    }

    pub fn shutdown(mut self) -> Result<(), DiscoveryError> {
        let _ = self.stop_advertising();
        let _ = self.stop_browsing();
        if let Ok(resp_rx) = self.daemon.shutdown() {
            // Keep the response receiver alive until the daemon acknowledges exit,
            // preventing the "sending on a closed channel" error in mdns_sd thread.
            let _ = resp_rx.recv_timeout(std::time::Duration::from_millis(500));
        }
        Ok(())
    }
}

impl Drop for MdnsHandle {
    fn drop(&mut self) {
        let _ = self.stop_advertising();
        let _ = self.stop_browsing();
    }
}
