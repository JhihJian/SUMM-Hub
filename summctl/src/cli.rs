use crate::config::Config;
use crate::discover::{discover_consumers, format_discovered_table, DiscoveredConsumer};
use crate::docker::DockerCompose;
use crate::error::{Result, SummctlError};
use crate::status::StatusChecker;
use crate::topology::Topology;
use clap::{Parser, Subcommand};
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "summctl")]
#[command(about = "SUMM-Hub Consumer Management CLI", long_about = None)]
#[command(version)]
pub struct Cli {
    /// Path to consumers.yaml (auto-detected if not specified)
    #[arg(short, long, global = true)]
    config: Option<PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

/// Find config file in order: -c option > SUMMCTL_CONFIG env > git root > current dir
fn find_config_file(explicit_path: Option<&Path>) -> Result<PathBuf> {
    // 1. Explicit path via -c option
    if let Some(path) = explicit_path {
        if path.exists() {
            return Ok(path.to_path_buf());
        }
        return Err(SummctlError::ConfigNotFound(path.display().to_string()));
    }

    // 2. Environment variable
    if let Ok(path) = std::env::var("SUMMCTL_CONFIG") {
        let p = PathBuf::from(&path);
        if p.exists() {
            return Ok(p);
        }
    }

    // 3. Git root directory
    if let Ok(output) = std::process::Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
    {
        if output.status.success() {
            let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let config = PathBuf::from(&root).join("consumers.yaml");
            if config.exists() {
                return Ok(config);
            }
        }
    }

    // 4. Current directory
    let local = PathBuf::from("consumers.yaml");
    if local.exists() {
        return Ok(local);
    }

    Err(SummctlError::ConfigNotFound(
        "consumers.yaml not found. Use -c option, set SUMMCTL_CONFIG, or run from project directory."
            .to_string(),
    ))
}

#[derive(Subcommand)]
enum Commands {
    /// List all consumers from consumers.yaml and their status
    Status,

    /// Discover running consumers from Docker (auto-discovery)
    Discover,

    /// Start a consumer
    Start {
        /// Consumer name
        name: String,
    },

    /// Stop a consumer
    Stop {
        /// Consumer name
        name: String,
    },

    /// Restart a consumer
    Restart {
        /// Consumer name
        name: String,
    },

    /// Show detailed info about a consumer
    Info {
        /// Consumer name
        name: String,
    },

    /// Show consumer logs
    Logs {
        /// Consumer name
        name: String,
        /// Follow log output
        #[arg(short, long)]
        follow: bool,
    },

    /// Show NATS subject topology
    Topology,
}

pub async fn run() -> Result<()> {
    let cli = Cli::parse();

    // Discover command doesn't need config file
    if matches!(cli.command, Commands::Discover) {
        let consumers = discover_consumers()?;
        println!("{}", format_discovered_table(&consumers));
        return Ok(());
    }

    // Other commands need config file
    let config_path = find_config_file(cli.config.as_deref())?;
    tracing::debug!("Using config: {}", config_path.display());
    let config = Config::load(&config_path)?;

    match cli.command {
        Commands::Discover => unreachable!(),

        Commands::Status => {
            let checker = StatusChecker::new(&config);
            let statuses = checker.check_all().await?;
            println!("{}", StatusChecker::format_table(&statuses));
        }

        Commands::Start { name } => {
            let consumer = config.get_consumer(&name)?;
            println!("Starting {}...", name);
            let compose = DockerCompose::new(&consumer.path);
            compose.up().await?;
            println!("\x1b[32m✓\x1b[0m Started: {}", name);
        }

        Commands::Stop { name } => {
            let consumer = config.get_consumer(&name)?;
            println!("Stopping {}...", name);
            let compose = DockerCompose::new(&consumer.path);
            compose.down().await?;
            println!("\x1b[32m✓\x1b[0m Stopped: {}", name);
        }

        Commands::Restart { name } => {
            let consumer = config.get_consumer(&name)?;
            println!("Restarting {}...", name);
            let compose = DockerCompose::new(&consumer.path);
            compose.restart().await?;
            println!("\x1b[32m✓\x1b[0m Restarted: {}", name);
        }

        Commands::Info { name } => {
            let consumer = config.get_consumer(&name)?;
            let compose = DockerCompose::new(&consumer.path);
            let status = compose.status().await?;

            println!("\x1b[1m{}\x1b[0m", name);
            println!("{}", "─".repeat(40));
            println!("Description: {}", consumer.description);
            println!("Status:      {}", status);
            println!("Path:        {}", consumer.path.display());
            println!();
            println!("\x1b[1mSubjects:\x1b[0m");
            let subscribe = if consumer.subjects.subscribe.is_empty() {
                "-".to_string()
            } else {
                consumer.subjects.subscribe.join(", ")
            };
            let publish = if consumer.subjects.publish.is_empty() {
                "-".to_string()
            } else {
                consumer.subjects.publish.join(", ")
            };
            println!("  Subscribe: {}", subscribe);
            println!("  Publish:   {}", publish);
            if !consumer.env.is_empty() {
                println!();
                println!("\x1b[1mEnvironment:\x1b[0m");
                for (key, value) in &consumer.env {
                    let display = if value.is_empty() {
                        "(not set)".to_string()
                    } else if key.contains("SECRET") || key.contains("TOKEN") || key.contains("PASSWORD") {
                        "********".to_string()
                    } else {
                        value.clone()
                    };
                    println!("  {}: {}", key, display);
                }
            }
        }

        Commands::Logs { name, follow } => {
            let consumer = config.get_consumer(&name)?;
            let compose = DockerCompose::new(&consumer.path);
            compose.logs(follow)?;
        }

        Commands::Topology => {
            let topology = Topology::from_config(&config);
            println!("{}", topology.format_tree());
        }
    }

    Ok(())
}
