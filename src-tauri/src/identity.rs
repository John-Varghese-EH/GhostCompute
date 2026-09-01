use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;
use snow::Builder;
use std::fs;
use std::path::Path;
use thiserror::Error;

use crate::transport::NOISE_PATTERN;

const KEYRING_SERVICE: &str = "com.ghostcompute";
const KEYRING_USER: &str = "identity_keys";

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error("Keyring error: {0}")]
    Keyring(String),
    #[error("Crypto error: {0}")]
    Crypto(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub struct NodeIdentity {
    pub signing_key: SigningKey,
    pub noise_private: [u8; 32],
    pub noise_public: [u8; 32],
}

impl Clone for NodeIdentity {
    fn clone(&self) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(&self.signing_key.to_bytes()),
            noise_private: self.noise_private,
            noise_public: self.noise_public,
        }
    }
}

impl NodeIdentity {
    pub fn load_or_create(fallback_dir: Option<&Path>) -> Result<Self, IdentityError> {
        match Self::load_from_keyring() {
            Ok(identity) => Ok(identity),
            Err(IdentityError::Keyring(ref msg))
                if msg.contains("NoEntry") || msg.contains("not found") =>
            {
                let identity = Self::generate()?;
                if let Err(e) = identity.save_to_keyring() {
                    log::warn!("Keyring save failed ({}), using file fallback", e);
                    if let Some(dir) = fallback_dir {
                        identity.save_to_file(dir)?;
                    }
                }
                Ok(identity)
            }
            Err(IdentityError::Keyring(ref msg)) => {
                log::warn!("Keyring unavailable ({}), trying file fallback", msg);
                if let Some(dir) = fallback_dir {
                    if let Ok(identity) = Self::load_from_file(dir) {
                        return Ok(identity);
                    }
                    let identity = Self::generate()?;
                    identity.save_to_file(dir)?;
                    return Ok(identity);
                }
                let identity = Self::generate()?;
                Ok(identity)
            }
            Err(e) => Err(e),
        }
    }

    fn generate() -> Result<Self, IdentityError> {
        let signing_key = SigningKey::generate(&mut OsRng);

        let builder = Builder::new(
            NOISE_PATTERN
                .parse()
                .map_err(|e| IdentityError::Crypto(format!("{}", e)))?,
        );
        let keypair = builder
            .generate_keypair()
            .map_err(|e| IdentityError::Crypto(format!("{}", e)))?;

        let mut noise_private = [0u8; 32];
        let mut noise_public = [0u8; 32];
        noise_private.copy_from_slice(&keypair.private);
        noise_public.copy_from_slice(&keypair.public);

        Ok(Self {
            signing_key,
            noise_private,
            noise_public,
        })
    }

    fn load_from_keyring() -> Result<Self, IdentityError> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| IdentityError::Keyring(format!("{}", e)))?;

        let stored = entry
            .get_password()
            .map_err(|e| IdentityError::Keyring(format!("{}", e)))?;

        Self::from_hex(&stored)
    }

    fn save_to_keyring(&self) -> Result<(), IdentityError> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| IdentityError::Keyring(format!("{}", e)))?;

        let hex_data = self.to_hex();
        entry
            .set_password(&hex_data)
            .map_err(|e| IdentityError::Keyring(format!("{}", e)))?;

        Ok(())
    }

    fn load_from_file(dir: &Path) -> Result<Self, IdentityError> {
        let path = dir.join("identity.key");
        let data = fs::read_to_string(&path)?;
        Self::from_hex(data.trim())
    }

    fn save_to_file(&self, dir: &Path) -> Result<(), IdentityError> {
        fs::create_dir_all(dir)?;
        let path = dir.join("identity.key");
        fs::write(&path, self.to_hex())?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
        }

        Ok(())
    }

    fn to_hex(&self) -> String {
        let mut combined = Vec::with_capacity(64);
        combined.extend_from_slice(&self.signing_key.to_bytes());
        combined.extend_from_slice(&self.noise_private);
        hex::encode(combined)
    }

    fn from_hex(hex_str: &str) -> Result<Self, IdentityError> {
        let bytes = hex::decode(hex_str)
            .map_err(|e| IdentityError::Crypto(format!("Invalid hex: {}", e)))?;

        if bytes.len() != 64 {
            return Err(IdentityError::Crypto(format!(
                "Expected 64 bytes, got {}",
                bytes.len()
            )));
        }

        let mut ed_seed = [0u8; 32];
        let mut noise_priv = [0u8; 32];
        ed_seed.copy_from_slice(&bytes[..32]);
        noise_priv.copy_from_slice(&bytes[32..]);

        let signing_key = SigningKey::from_bytes(&ed_seed);

        // Derive the noise public key from the private key
        let builder = Builder::new(
            NOISE_PATTERN
                .parse()
                .map_err(|e| IdentityError::Crypto(format!("{}", e)))?,
        );
        let keypair = builder
            .local_private_key(&noise_priv)
            .generate_keypair()
            .map_err(|e| IdentityError::Crypto(format!("{}", e)))?;

        let mut noise_public = [0u8; 32];
        noise_public.copy_from_slice(&keypair.public);

        Ok(Self {
            signing_key,
            noise_private: noise_priv,
            noise_public,
        })
    }

    pub fn peer_id(&self) -> String {
        hex::encode(self.noise_public)
    }

    pub fn device_name() -> String {
        hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "Unknown".to_string())
    }
}
