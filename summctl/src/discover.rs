use crate::error::{Result, SummctlError};
use std::collections::HashMap;

/// Label prefix for SUMM consumer discovery
pub const LABEL_PREFIX: &str = "summ.dev";
pub const LABEL_ROLE: &str = "summ.dev/role";
pub const LABEL_NAME: &str = "summ.dev/name";
pub const LABEL_SUBSCRIBE: &str = "summ.dev/subscribe";
pub const LABEL_PUBLISH: &str = "summ.dev/publish";

/// Discovered consumer from Docker labels
#[derive(Debug, Clone)]
pub struct DiscoveredConsumer {
    pub name: String,
    pub container_id: String,
    pub status: String,
    pub subjects: Subjects,
    pub compose_path: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct Subjects {
    pub subscribe: Vec<String>,
    pub publish: Vec<String>,
}

/// Discover all SUMM consumers from running Docker containers
pub fn discover_consumers() -> Result<Vec<DiscoveredConsumer>> {
    let output = std::process::Command::new("docker")
        .args([
            "ps",
            "--filter",
            &format!("label={}=consumer", LABEL_ROLE),
            "--format",
            "{{json .}}",
        ])
        .output()
        .map_err(|e| SummctlError::DockerError(format!("Failed to list containers: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(SummctlError::DockerError(stderr.to_string()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut consumers = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(container) = parse_container_json(line) {
            consumers.push(container);
        }
    }

    // Sort by name
    consumers.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(consumers)
}

/// Parse a single container JSON line
fn parse_container_json(json: &str) -> Result<DiscoveredConsumer> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|e| SummctlError::DockerError(e.to_string()))?;

    let labels = value
        .get("Labels")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    // Get name from label or container name
    let name = labels
        .get(LABEL_NAME.strip_prefix("summ.dev/").unwrap())
        .and_then(|v| v.as_str())
        .or_else(|| {
            value
                .get("Names")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
                .map(|s| s.trim_start_matches('/'))
        })
        .unwrap_or("unknown")
        .to_string();

    // Get container ID (short)
    let container_id = value
        .get("ID")
        .and_then(|v| v.as_str())
        .map(|s| s.chars().take(12).collect())
        .unwrap_or_default();

    // Get status
    let status = value
        .get("State")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    // Get compose path
    let compose_path = labels
        .get("com.docker.compose.project.working_dir")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Parse subscribe subjects
    let subscribe = labels
        .get(LABEL_SUBSCRIBE.strip_prefix("summ.dev/").unwrap())
        .and_then(|v| v.as_str())
        .map(|s| s.split(',').map(|s| s.trim().to_string()).collect())
        .unwrap_or_default();

    // Parse publish subjects
    let publish = labels
        .get(LABEL_PUBLISH.strip_prefix("summ.dev/").unwrap())
        .and_then(|v| v.as_str())
        .map(|s| s.split(',').map(|s| s.trim().to_string()).collect())
        .unwrap_or_default();

    Ok(DiscoveredConsumer {
        name,
        container_id,
        status,
        subjects: Subjects { subscribe, publish },
        compose_path,
    })
}

/// Format discovered consumers as a table
pub fn format_discovered_table(consumers: &[DiscoveredConsumer]) -> String {
    let mut result = String::new();

    // Header
    result.push_str(&format!(
        "{:<22} {:<10} {:<14} {:<25} {:<30}\n",
        "NAME", "STATUS", "CONTAINER", "SUBJECTS IN", "SUBJECTS OUT"
    ));
    result.push_str(&"─".repeat(101));
    result.push('\n');

    if consumers.is_empty() {
        result.push_str("No consumers discovered. Make sure containers have labels:\n");
        result.push_str("  summ.dev/role=consumer\n");
        result.push_str("  summ.dev/name=<name>\n");
        result.push_str("  summ.dev/subscribe=<subjects>\n");
        result.push_str("  summ.dev/publish=<subjects>\n");
        return result;
    }

    for c in consumers {
        let subjects_in = if c.subjects.subscribe.is_empty() {
            "-".to_string()
        } else {
            c.subjects.subscribe.join(", ")
        };
        let subjects_out = if c.subjects.publish.is_empty() {
            "-".to_string()
        } else {
            c.subjects.publish.join(", ")
        };

        let status_colored = match c.status.as_str() {
            "running" => "\x1b[32mrunning\x1b[0m",
            "exited" => "\x1b[31mexited\x1b[0m",
            _ => "\x1b[33m{c.status}\x1b[0m",
        };

        result.push_str(&format!(
            "{:<22} {:<19} {:<14} {:<25} {:<30}\n",
            c.name,
            status_colored,
            c.container_id,
            subjects_in,
            subjects_out
        ));
    }

    result
}
