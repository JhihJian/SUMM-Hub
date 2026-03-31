use crate::config::Config;
use crate::docker::DockerCompose;
use crate::error::Result;
use crate::status::StatusChecker;
use crate::topology::Topology;
use clap::{Parser, Subcommand};
use std::path::Path;

#[derive(Parser)]
#[command(name = "summctl")]
#[command(about = "SUMM-Hub Consumer Management CLI", long_about = None)]
#[command(version)]
pub struct Cli {
    /// Path to consumers.yaml
    #[arg(short, long, global = true, default_value = "consumers.yaml")]
    config: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List all consumers and their status
    Status,

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
    let config_path = Path::new(&cli.config);
    let config = Config::load(config_path)?;

    match cli.command {
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
