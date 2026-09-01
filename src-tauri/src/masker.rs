use regex::Regex;

pub fn mask_credentials(input: &str) -> String {
    // Redact sk-...
    let sk_re = Regex::new(r"sk-[a-zA-Z0-9]{32,}").unwrap();
    let mut out = sk_re.replace_all(input, "[REDACTED]").to_string();

    // Redact Bearer ...
    let bearer_re = Regex::new(r"(?i)bearer\s+[a-zA-Z0-9\-\._~+/]+=*").unwrap();
    out = bearer_re.replace_all(&out, "Bearer [REDACTED]").to_string();

    out
}
