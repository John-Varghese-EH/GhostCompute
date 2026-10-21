use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PeerStoreError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Peer not found: {0}")]
    NotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Admin,
    Developer,
    Viewer,
}

impl Default for UserRole {
    fn default() -> Self {
        UserRole::Developer
    }
}

impl ToString for UserRole {
    fn to_string(&self) -> String {
        match self {
            UserRole::Admin => "admin".to_string(),
            UserRole::Developer => "developer".to_string(),
            UserRole::Viewer => "viewer".to_string(),
        }
    }
}

impl From<&str> for UserRole {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "admin" => UserRole::Admin,
            "viewer" => UserRole::Viewer,
            _ => UserRole::Developer,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedPeer {
    pub peer_id: String,
    pub device_name: String,
    pub noise_public_key: String,
    pub paired_at: String,
    pub last_seen: Option<String>,
    pub revoked: bool,
    pub role: UserRole,
    pub api_token: Option<String>,
    pub rate_limit_rpm: u32,
}

pub struct PeerStore {
    conn: Connection,
}

impl PeerStore {
    pub fn open(path: &Path) -> Result<Self, PeerStoreError> {
        let conn = Connection::open(path)?;

        conn.pragma_update(None, "journal_mode", "WAL")?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS peers(
                peer_id TEXT PRIMARY KEY,
                device_name TEXT NOT NULL,
                noise_public_key TEXT NOT NULL,
                paired_at TEXT NOT NULL,
                last_seen TEXT,
                revoked INTEGER DEFAULT 0,
                role TEXT DEFAULT 'developer',
                api_token TEXT,
                rate_limit_rpm INTEGER DEFAULT 60
            )",
            [],
        )?;

        // Ensure columns exist if migrating from old schema
        let _ = conn.execute("ALTER TABLE peers ADD COLUMN role TEXT DEFAULT 'developer'", []);
        let _ = conn.execute("ALTER TABLE peers ADD COLUMN api_token TEXT", []);
        let _ = conn.execute("ALTER TABLE peers ADD COLUMN rate_limit_rpm INTEGER DEFAULT 60", []);

        Ok(Self { conn })
    }

    pub fn add_peer(
        &self,
        peer_id: &str,
        device_name: &str,
        noise_pub_key: &str,
    ) -> Result<(), PeerStoreError> {
        self.add_peer_with_role(peer_id, device_name, noise_pub_key, UserRole::Developer, None, 60)
    }

    pub fn add_peer_with_role(
        &self,
        peer_id: &str,
        device_name: &str,
        noise_pub_key: &str,
        role: UserRole,
        api_token: Option<&str>,
        rate_limit_rpm: u32,
    ) -> Result<(), PeerStoreError> {
        let now = Utc::now().to_rfc3339();
        let role_str = role.to_string();
        self.conn.execute(
            "INSERT OR REPLACE INTO peers (peer_id, device_name, noise_public_key, paired_at, revoked, role, api_token, rate_limit_rpm)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)",
            params![peer_id, device_name, noise_pub_key, now, role_str, api_token, rate_limit_rpm],
        )?;
        Ok(())
    }

    pub fn update_role(
        &self,
        peer_id: &str,
        role: UserRole,
        rate_limit_rpm: u32,
    ) -> Result<(), PeerStoreError> {
        let role_str = role.to_string();
        let updated = self.conn.execute(
            "UPDATE peers SET role = ?1, rate_limit_rpm = ?2 WHERE peer_id = ?3",
            params![role_str, rate_limit_rpm, peer_id],
        )?;
        if updated == 0 {
            return Err(PeerStoreError::NotFound(peer_id.to_string()));
        }
        Ok(())
    }

    pub fn generate_api_token(&self, peer_id: &str) -> Result<String, PeerStoreError> {
        let token = format!("gc_live_{}", uuid::Uuid::new_v4().simple());
        let updated = self.conn.execute(
            "UPDATE peers SET api_token = ?1 WHERE peer_id = ?2",
            params![token, peer_id],
        )?;
        if updated == 0 {
            return Err(PeerStoreError::NotFound(peer_id.to_string()));
        }
        Ok(token)
    }

    pub fn get_peer(&self, peer_id: &str) -> Result<Option<TrustedPeer>, PeerStoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT peer_id, device_name, noise_public_key, paired_at, last_seen, revoked, role, api_token, rate_limit_rpm 
             FROM peers WHERE peer_id = ?1",
        )?;

        let peer = stmt
            .query_row(params![peer_id], |row| {
                let role_str: String = row.get(6).unwrap_or_else(|_| "developer".to_string());
                Ok(TrustedPeer {
                    peer_id: row.get(0)?,
                    device_name: row.get(1)?,
                    noise_public_key: row.get(2)?,
                    paired_at: row.get(3)?,
                    last_seen: row.get(4)?,
                    revoked: row.get::<_, i32>(5)? != 0,
                    role: UserRole::from(role_str.as_str()),
                    api_token: row.get(7)?,
                    rate_limit_rpm: row.get::<_, u32>(8).unwrap_or(60),
                })
            })
            .optional()?;

        Ok(peer)
    }

    pub fn list_peers(&self) -> Result<Vec<TrustedPeer>, PeerStoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT peer_id, device_name, noise_public_key, paired_at, last_seen, revoked, role, api_token, rate_limit_rpm 
             FROM peers",
        )?;

        let peer_iter = stmt.query_map([], |row| {
            let role_str: String = row.get(6).unwrap_or_else(|_| "developer".to_string());
            Ok(TrustedPeer {
                peer_id: row.get(0)?,
                device_name: row.get(1)?,
                noise_public_key: row.get(2)?,
                paired_at: row.get(3)?,
                last_seen: row.get(4)?,
                revoked: row.get::<_, i32>(5)? != 0,
                role: UserRole::from(role_str.as_str()),
                api_token: row.get(7)?,
                rate_limit_rpm: row.get::<_, u32>(8).unwrap_or(60),
            })
        })?;

        let mut peers = Vec::new();
        for peer in peer_iter {
            peers.push(peer?);
        }

        Ok(peers)
    }

    pub fn revoke_peer(&self, peer_id: &str) -> Result<(), PeerStoreError> {
        let updated = self.conn.execute(
            "UPDATE peers SET revoked = 1 WHERE peer_id = ?1",
            params![peer_id],
        )?;

        if updated == 0 {
            return Err(PeerStoreError::NotFound(peer_id.to_string()));
        }
        Ok(())
    }

    pub fn remove_peer(&self, peer_id: &str) -> Result<(), PeerStoreError> {
        let deleted = self
            .conn
            .execute("DELETE FROM peers WHERE peer_id = ?1", params![peer_id])?;

        if deleted == 0 {
            return Err(PeerStoreError::NotFound(peer_id.to_string()));
        }
        Ok(())
    }

    pub fn is_trusted(&self, noise_pub_key: &str) -> Result<bool, PeerStoreError> {
        let mut stmt = self
            .conn
            .prepare("SELECT revoked FROM peers WHERE noise_public_key = ?1")?;

        let revoked: Option<i32> = stmt
            .query_row(params![noise_pub_key], |row| row.get(0))
            .optional()?;

        Ok(revoked == Some(0))
    }

    pub fn update_last_seen(&self, peer_id: &str) -> Result<(), PeerStoreError> {
        let now = Utc::now().to_rfc3339();
        let updated = self.conn.execute(
            "UPDATE peers SET last_seen = ?1 WHERE peer_id = ?2",
            params![now, peer_id],
        )?;

        if updated == 0 {
            return Err(PeerStoreError::NotFound(peer_id.to_string()));
        }
        Ok(())
    }
}
