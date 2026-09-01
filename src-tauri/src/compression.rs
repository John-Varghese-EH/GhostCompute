pub fn lite_compress(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut last_was_blank = false;
    for line in input.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            if !last_was_blank {
                out.push('\n');
                last_was_blank = true;
            }
        } else {
            // Remove zero width spaces and other invisibles if needed, but a simple replace is fine
            let clean = trimmed.replace('\u{200B}', "");
            out.push_str(&clean);
            out.push('\n');
            last_was_blank = false;
        }
    }
    out
}
