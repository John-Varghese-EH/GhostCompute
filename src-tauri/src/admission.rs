use crate::settings::AppSettings;
use std::sync::Arc;
use tokio::sync::{Semaphore, SemaphorePermit};

#[allow(dead_code)]
pub struct AdmissionGate {
    semaphore: Arc<Semaphore>,
    max_payload_bytes: usize,
    max_context_tokens: u32,
}

impl AdmissionGate {
    pub fn new(settings: &AppSettings) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(settings.max_concurrent_requests as usize)),
            max_payload_bytes: settings.max_payload_bytes,
            max_context_tokens: settings.max_context_tokens,
        }
    }

    pub fn check_payload_size(&self, size: usize) -> Result<(), String> {
        if size > self.max_payload_bytes {
            return Err(format!(
                "Payload too large: {} > {}",
                size, self.max_payload_bytes
            ));
        }
        Ok(())
    }

    pub async fn acquire(&self) -> Result<SemaphorePermit<'_>, String> {
        self.semaphore
            .acquire()
            .await
            .map_err(|_| "Server is shutting down".to_string())
    }
}
