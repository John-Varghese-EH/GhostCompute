use chrono::{DateTime, Duration, Utc};
use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum PairingState {
    Idle,
    Discovering,
    AwaitingConfirmation {
        sas: String,
        peer_id: String,
        device_name: String,
    },
    Completed {
        peer_id: String,
    },
    Failed {
        reason: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PairingCode {
    pub code: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PairingLink {
    pub url: String,
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

const WORDLIST: [&str; 266] = [
    "apple", "brave", "crane", "drift", "eagle", "flame", "grape", "heart", "image", "joker",
    "karma", "lemon", "mango", "noble", "ocean", "pearl", "query", "raven", "solar", "tiger",
    "ultra", "vivid", "whale", "xenon", "yacht", "zebra", "actor", "badge", "cabin", "dance",
    "early", "fable", "giant", "habit", "ideal", "joint", "knock", "label", "magic", "naval",
    "oasis", "panel", "quiet", "radio", "scale", "table", "uncle", "valid", "watch", "yield",
    "alert", "basic", "camel", "dairy", "eager", "fancy", "ghost", "happy", "index", "judge",
    "kneel", "large", "macro", "nerve", "orbit", "paper", "quick", "radar", "saint", "taste",
    "union", "value", "waste", "youth", "alien", "basin", "candy", "daily", "eagle", "fault",
    "giant", "harsh", "inner", "juice", "knife", "layer", "major", "never", "order", "party",
    "quote", "raise", "salad", "tease", "unity", "vault", "water", "young", "alive", "basis",
    "canon", "dance", "earth", "favor", "glass", "heavy", "input", "jumpy", "knock", "laser",
    "maker", "newly", "other", "patch", "quota", "rally", "salon", "theme", "upset", "venom",
    "weigh", "yummy", "allow", "beach", "cargo", "dandy", "eaten", "feast", "globe", "hedge",
    "irony", "jumbo", "known", "later", "march", "night", "outer", "pause", "rabid", "ranch",
    "salty", "there", "urban", "venue", "weird", "zesty", "alone", "beard", "catch", "dated",
    "ebony", "fetch", "glory", "hello", "issue", "jazzy", "krill", "laugh", "match", "ninja",
    "owner", "peace", "radio", "range", "sandy", "thick", "usage", "verge", "wheat", "zonal",
    "along", "beast", "cause", "datum", "eclat", "fever", "glove", "hence", "ivory", "jeans",
    "kiosk", "layer", "medal", "noble", "oxide", "peach", "rainy", "rapid", "sauce", "thing",
    "usual", "verse", "wheel", "zoned", "aloud", "beefy", "chain", "daunt", "edify", "fiber",
    "glows", "heron", "jaded", "jelly", "koala", "learn", "melon", "noise", "ozone", "phase",
    "raise", "ratio", "scale", "think", "utter", "video", "where", "zones", "alpha", "began",
    "chair", "dawn", "eerie", "field", "glued", "hides", "jaunt", "jolly", "kudos", "lease",
    "mercy", "north", "paced", "phone", "rajah", "raven", "scare", "third", "vague", "virus",
    "which", "zooms", "altar", "begin", "chalk", "dazed", "eight", "fiery", "gnome", "hilly",
    "jawed", "joule", "kayak", "leave", "merge", "notch", "packs", "photo", "raked", "reach",
    "scarf", "those", "valet", "visit", "while", "zappy",
];

pub fn generate_pairing_code() -> PairingCode {
    let mut rng = rand::thread_rng();
    let word1 = WORDLIST.choose(&mut rng).unwrap();
    let word2 = WORDLIST.choose(&mut rng).unwrap();
    let num: u8 = rng.gen_range(10..=99);

    let code = format!("{}-{}-{:02}", word1, word2, num);
    let expires_at = Utc::now() + Duration::minutes(10);

    PairingCode { code, expires_at }
}

pub fn generate_pairing_link() -> PairingLink {
    let mut rng = rand::thread_rng();
    let mut token_bytes = [0u8; 32];
    rng.fill(&mut token_bytes);

    let token = hex::encode(token_bytes);
    let url = format!("ghostcompute://pair/{}", token);
    let expires_at = Utc::now() + Duration::minutes(10);

    PairingLink {
        url,
        token,
        expires_at,
    }
}

