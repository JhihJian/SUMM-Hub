use thiserror::Error;

#[derive(Debug, Error)]
pub enum SummctlError {
    #[error("Consumer not found: {0}")]
    NotFound(String),

    #[error("Docker compose command failed: {0}")]
    DockerError(String),

    #[error("Failed to parse config: {0}")]
    ConfigParseError(#[from] serde_yaml::Error),

    #[error("Config file not found: {0}")]
    ConfigNotFound(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Environment variable not set: {0}")]
    EnvVarMissing(String),
}

pub type Result<T> = std::result::Result<T, SummctlError>;
