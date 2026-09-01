use blake2::{Blake2s256, Digest};
use futures_util::{SinkExt, StreamExt};
use snow::{Builder, TransportState};
use thiserror::Error;
use tokio_tungstenite::tungstenite::Message;

pub const NOISE_PATTERN: &str = "Noise_XX_25519_ChaChaPoly_BLAKE2s";
#[allow(dead_code)]
pub const MAX_MSG_SIZE: usize = 65519;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum TransportError {
    #[error("Noise error: {0}")]
    Noise(#[from] snow::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("WebSocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),
    #[error("Handshake failed: {0}")]
    HandshakeFailed(String),
    #[error("Message too large")]
    MessageTooLarge,
    #[error("Connection closed")]
    ConnectionClosed,
}

pub type BoxSink = Box<
    dyn futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Send + Unpin,
>;
pub type BoxStream = Box<
    dyn futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
        + Send
        + Unpin,
>;

pub struct NoiseSession {
    transport: TransportState,
    tx: BoxSink,
    rx: BoxStream,
    remote_peer_id: String,
}

impl NoiseSession {
    pub async fn send(&mut self, payload: &[u8]) -> Result<(), TransportError> {
        let mut buf = vec![0u8; payload.len() + 16];
        let len = self.transport.write_message(payload, &mut buf)?;
        buf.truncate(len);
        self.tx.send(Message::Binary(buf)).await?;
        Ok(())
    }

    pub async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        while let Some(msg_res) = self.rx.next().await {
            let msg = msg_res?;
            if let Message::Binary(data) = msg {
                let mut buf = vec![0u8; data.len()];
                let len = self.transport.read_message(&data, &mut buf)?;
                buf.truncate(len);
                return Ok(buf);
            }
        }
        Err(TransportError::ConnectionClosed)
    }

    pub fn peer_id(&self) -> &str {
        &self.remote_peer_id
    }
}

pub async fn handshake_as_initiator(
    mut tx: BoxSink,
    mut rx: BoxStream,
    local_priv: &[u8; 32],
) -> Result<NoiseSession, TransportError> {
    let builder = Builder::new(NOISE_PATTERN.parse()?);
    let mut hs = builder.local_private_key(local_priv).build_initiator()?;
    let mut buf = vec![0u8; 65535];

    // -> e
    let len = hs.write_message(&[], &mut buf)?;
    tx.send(Message::Binary(buf[..len].to_vec())).await?;

    // <- e, ee, s, es
    let mut msg_data = vec![];
    while let Some(msg_res) = rx.next().await {
        if let Message::Binary(data) = msg_res? {
            msg_data = data;
            break;
        }
    }
    if msg_data.is_empty() {
        return Err(TransportError::ConnectionClosed);
    }
    hs.read_message(&msg_data, &mut buf)?;

    // -> s, se
    let len = hs.write_message(&[], &mut buf)?;
    tx.send(Message::Binary(buf[..len].to_vec())).await?;

    let remote_static = hs
        .get_remote_static()
        .ok_or_else(|| TransportError::HandshakeFailed("Missing remote static key".into()))?;

    let remote_peer_id = hex::encode(remote_static);
    let transport = hs.into_transport_mode()?;

    Ok(NoiseSession {
        transport,
        tx,
        rx,
        remote_peer_id,
    })
}

pub async fn handshake_as_responder(
    mut tx: BoxSink,
    mut rx: BoxStream,
    local_priv: &[u8; 32],
) -> Result<NoiseSession, TransportError> {
    let builder = Builder::new(NOISE_PATTERN.parse()?);
    let mut hs = builder.local_private_key(local_priv).build_responder()?;
    let mut buf = vec![0u8; 65535];

    // <- e
    let mut msg_data = vec![];
    while let Some(msg_res) = rx.next().await {
        if let Message::Binary(data) = msg_res? {
            msg_data = data;
            break;
        }
    }
    if msg_data.is_empty() {
        return Err(TransportError::ConnectionClosed);
    }
    hs.read_message(&msg_data, &mut buf)?;

    // -> e, ee, s, es
    let len = hs.write_message(&[], &mut buf)?;
    tx.send(Message::Binary(buf[..len].to_vec())).await?;

    // <- s, se
    msg_data.clear();
    while let Some(msg_res) = rx.next().await {
        if let Message::Binary(data) = msg_res? {
            msg_data = data;
            break;
        }
    }
    if msg_data.is_empty() {
        return Err(TransportError::ConnectionClosed);
    }
    hs.read_message(&msg_data, &mut buf)?;

    let remote_static = hs
        .get_remote_static()
        .ok_or_else(|| TransportError::HandshakeFailed("Missing remote static key".into()))?;

    let remote_peer_id = hex::encode(remote_static);
    let transport = hs.into_transport_mode()?;

    Ok(NoiseSession {
        transport,
        tx,
        rx,
        remote_peer_id,
    })
}

#[allow(dead_code)]
pub fn compute_sas(key1: &str, key2: &str) -> String {
    let mut keys = [key1, key2];
    keys.sort();

    let mut hasher = Blake2s256::new();
    hasher.update(keys[0].as_bytes());
    hasher.update(keys[1].as_bytes());
    let result = hasher.finalize();

    let num1 = ((result[0] as u16) << 8 | (result[1] as u16)) % 100;
    let num2 = ((result[2] as u16) << 8 | (result[3] as u16)) % 100;

    format!("{:02} . {:02}", num1, num2)
}
