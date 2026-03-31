use crate::error::{Result, SummctlError};
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct DockerCompose {
    project_path: PathBuf,
}

impl DockerCompose {
    pub fn new(project_path: &Path) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
        }
    }

    /// 启动容器
    pub async fn up(&self) -> Result<()> {
        self.run_command(&["up", "-d"]).await
    }

    /// 停止容器
    pub async fn down(&self) -> Result<()> {
        self.run_command(&["down"]).await
    }

    /// 重启容器
    pub async fn restart(&self) -> Result<()> {
        self.run_command(&["restart"]).await
    }

    /// 获取日志
    pub fn logs(&self, follow: bool) -> Result<()> {
        let mut args = vec!["logs"];
        if follow {
            args.push("-f");
        }
        self.run_command_sync(&args)
    }

    /// 检查服务状态，返回 "running" | "stopped" | "unknown"
    pub async fn status(&self) -> Result<String> {
        // 使用 docker compose ps 检查状态
        let output = Command::new("docker")
            .args(["compose", "ps", "--format", "json"])
            .current_dir(&self.project_path)
            .output()
            .map_err(|e| SummctlError::DockerError(e.to_string()))?;

        if !output.status.success() {
            return Ok("unknown".to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        // 检查是否有 running 状态的容器
        if stdout.contains("\"running\"") || stdout.contains("running") {
            Ok("running".to_string())
        } else if stdout.trim().is_empty() || stdout == "[]" || stdout == "null" {
            Ok("stopped".to_string())
        } else {
            Ok("stopped".to_string())
        }
    }

    async fn run_command(&self, args: &[&str]) -> Result<()> {
        let full_args: Vec<&str> = ["compose"].iter().chain(args).copied().collect();

        tracing::debug!("Running: docker {}", full_args.join(" "));

        let output = Command::new("docker")
            .args(&full_args)
            .current_dir(&self.project_path)
            .output()
            .map_err(|e| SummctlError::DockerError(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(SummctlError::DockerError(stderr.to_string()));
        }

        Ok(())
    }

    fn run_command_sync(&self, args: &[&str]) -> Result<()> {
        let full_args: Vec<&str> = ["compose"].iter().chain(args).copied().collect();

        let status = Command::new("docker")
            .args(&full_args)
            .current_dir(&self.project_path)
            .status()
            .map_err(|e| SummctlError::DockerError(e.to_string()))?;

        if !status.success() {
            return Err(SummctlError::DockerError("Command failed".to_string()));
        }

        Ok(())
    }
}
