use crate::config::{Config, ConsumerConfig};
use crate::docker::DockerCompose;
use crate::error::Result;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ConsumerStatus {
    pub name: String,
    pub description: String,
    pub status: String,
    pub subjects_in: Vec<String>,
    pub subjects_out: Vec<String>,
}

pub struct StatusChecker<'a> {
    config: &'a Config,
}

impl<'a> StatusChecker<'a> {
    pub fn new(config: &'a Config) -> Self {
        Self { config }
    }

    /// 获取所有 consumer 状态
    pub async fn check_all(&self) -> Result<Vec<ConsumerStatus>> {
        let mut statuses = Vec::new();

        for (name, consumer_config) in &self.config.consumers {
            let status = self.check_one(name, consumer_config).await?;
            statuses.push(status);
        }

        // 按名称排序
        statuses.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(statuses)
    }

    /// 获取单个 consumer 状态
    pub async fn check_one(
        &self,
        name: &str,
        config: &ConsumerConfig,
    ) -> Result<ConsumerStatus> {
        let compose = DockerCompose::new(&config.path);
        let status = compose
            .status()
            .await
            .unwrap_or_else(|_| "unknown".to_string());

        Ok(ConsumerStatus {
            name: name.to_string(),
            description: config.description.clone(),
            status,
            subjects_in: config.subjects.subscribe.clone(),
            subjects_out: config.subjects.publish.clone(),
        })
    }

    /// 格式化为表格输出
    pub fn format_table(statuses: &[ConsumerStatus]) -> String {
        let mut result = String::new();

        // 表头
        result.push_str(&format!(
            "{:<22} {:<10} {:<25} {:<30}\n",
            "NAME", "STATUS", "SUBJECTS IN", "SUBJECTS OUT"
        ));
        result.push_str(&"─".repeat(87));
        result.push('\n');

        for s in statuses {
            let subjects_in = if s.subjects_in.is_empty() {
                "-".to_string()
            } else {
                s.subjects_in.join(", ")
            };
            let subjects_out = if s.subjects_out.is_empty() {
                "-".to_string()
            } else {
                s.subjects_out.join(", ")
            };

            let status_colored = match s.status.as_str() {
                "running" => "\x1b[32mrunning\x1b[0m",
                "stopped" => "\x1b[31mstopped\x1b[0m",
                _ => "\x1b[33munknown\x1b[0m",
            };

            result.push_str(&format!(
                "{:<22} {:<19} {:<25} {:<30}\n",
                s.name, status_colored, subjects_in, subjects_out
            ));
        }

        result
    }
}
