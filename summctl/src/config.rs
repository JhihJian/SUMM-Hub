use crate::error::{Result, SummctlError};
use regex::Regex;
use serde::Deserialize;
use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};

/// consumers.yaml 根结构
#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    #[serde(default)]
    pub defaults: Option<Defaults>,
    pub consumers: HashMap<String, ConsumerConfig>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Defaults {
    pub nats_url: Option<String>,
    pub log_level: Option<String>,
}

/// 单个 Consumer 配置
#[derive(Debug, Deserialize, Clone)]
pub struct ConsumerConfig {
    pub description: String,
    pub path: PathBuf,
    pub subjects: Subjects,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Subjects {
    pub subscribe: Vec<String>,
    pub publish: Vec<String>,
}

impl Config {
    /// 从文件加载配置
    pub fn load(path: &Path) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .map_err(|_| SummctlError::ConfigNotFound(path.display().to_string()))?;
        let mut config: Config = serde_yaml::from_str(&content)?;

        // 替换环境变量
        for consumer in config.consumers.values_mut() {
            for value in consumer.env.values_mut() {
                *value = expand_env_vars(value)?;
            }
        }

        Ok(config)
    }

    /// 获取 consumer 配置
    pub fn get_consumer(&self, name: &str) -> Result<&ConsumerConfig> {
        self.consumers
            .get(name)
            .ok_or_else(|| SummctlError::NotFound(name.to_string()))
    }
}

/// 展开环境变量 ${VAR} 和 ${VAR:-default}
fn expand_env_vars(s: &str) -> Result<String> {
    let re = Regex::new(r"\$\{([^}]+)\}").unwrap();
    let mut result = s.to_string();

    for cap in re.captures_iter(s) {
        let full = &cap[0];
        let inner = &cap[1];

        let (var_name, default) = if let Some(idx) = inner.find(":-") {
            (&inner[..idx], Some(&inner[idx + 2..]))
        } else {
            (inner, None)
        };

        let replacement = match (env::var(var_name).ok(), default) {
            (Some(val), _) => val,
            (None, Some(def)) => def.to_string(),
            (None, None) => return Err(SummctlError::EnvVarMissing(var_name.to_string())),
        };

        result = result.replace(full, &replacement);
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_env_vars_with_default() {
        env::remove_var("TEST_VAR_FOR_SUMMCTL");
        let result = expand_env_vars("${TEST_VAR_FOR_SUMMCTL:-default_value}").unwrap();
        assert_eq!(result, "default_value");
    }

    #[test]
    fn test_expand_env_vars_with_value() {
        env::set_var("TEST_VAR_FOR_SUMMCTL", "actual_value");
        let result = expand_env_vars("${TEST_VAR_FOR_SUMMCTL:-default}").unwrap();
        assert_eq!(result, "actual_value");
        env::remove_var("TEST_VAR_FOR_SUMMCTL");
    }
}
