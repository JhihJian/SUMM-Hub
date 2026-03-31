mod cli;
mod config;
mod discover;
mod docker;
mod error;
mod status;
mod topology;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    if let Err(e) = cli::run().await {
        eprintln!("\x1b[31mError:\x1b[0m {}", e);
        std::process::exit(1);
    }
}
