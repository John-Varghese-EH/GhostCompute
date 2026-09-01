use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PeerStoreError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Peer not found: {0}")]
    NotFound(String),
}

#[derive(Debug, Clone, Serialize)]
pub struct TrustedPeer {
    pub peer_id: String,
    pub device_name: String,
    pub noise_public_key: String,
    pub paired_at: String,
    pub last_seen: Option<String>,
    pub revoked: bool,
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
                revoked INTEGER DEFAULT 0
            )",
            [],
        )?;

        Ok(Self { conn })
    }

    pub fn add_peer(
        &self,
        peer_id: &str,
        device_name: &str,
        noise_pub_key: &str,
    ) -> Result<(), PeerStoreError> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO peers (peer_id, device_name, noise_public_key, paired_at, revoked)
             VALUES (?1, ?2, ?3, ?4, 0)",
            params![peer_id, device_name, noise_pub_key, now],
        )?;
        Ok(())
    }

    pub fn get_peer(&self, peer_id: &str) -> Result<Option<TrustedPeer>, PeerStoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT peer_id, device_name, noise_public_key, paired_at, last_seen, revoked 
             FROM peers WHERE peer_id = ?1",
        )?;

        let peer = stmt
            .query_row(params![peer_id], |row| {
                Ok(TrustedPeer {
                    peer_id: row.get(0)?,
                    device_name: row.get(1)?,
                    noise_public_key: row.get(2)?,
                    paired_at: row.get(3)?,
                    last_seen: row.get(4)?,
                    revoked: row.get::<_, i32>(5)? != 0,
                })
            })
            .optional()?;

        Ok(peer)
    }

    pub fn list_peers(&self) -> Result<Vec<TrustedPeer>, PeerStoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT peer_id, device_name, noise_public_key, paired_at, last_seen, revoked 
             FROM peers",
        )?;

        let peer_iter = stmt.query_map([], |row| {
            Ok(TrustedPeer {
                peer_id: row.get(0)?,
                device_name: row.get(1)?,
                noise_public_key: row.get(2)?,
                paired_at: row.get(3)?,
                last_seen: row.get(4)?,
                revoked: row.get::<_, i32>(5)? != 0,
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
