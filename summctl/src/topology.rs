use crate::config::Config;
use std::collections::HashMap;

#[derive(Debug)]
pub struct Topology {
    /// subject -> [(consumer, direction)]
    pub edges: HashMap<String, Vec<(String, Direction)>>,
}

#[derive(Debug, Clone)]
pub enum Direction {
    Subscribe,
    Publish,
}

impl Topology {
    pub fn from_config(config: &Config) -> Self {
        let mut edges: HashMap<String, Vec<(String, Direction)>> = HashMap::new();

        for (name, consumer) in &config.consumers {
            for subject in &consumer.subjects.subscribe {
                edges
                    .entry(subject.clone())
                    .or_default()
                    .push((name.clone(), Direction::Subscribe));
            }
            for subject in &consumer.subjects.publish {
                edges
                    .entry(subject.clone())
                    .or_default()
                    .push((name.clone(), Direction::Publish));
            }
        }

        Self { edges }
    }

    /// 格式化为树形输出
    pub fn format_tree(&self) -> String {
        let mut result = String::new();
        result.push_str("\x1b[1mNATS Subject Topology\x1b[0m\n");
        result.push_str("═════════════════════\n\n");

        let mut subjects: Vec<_> = self.edges.keys().collect();
        subjects.sort();

        for subject in subjects {
            result.push_str(&format!("\x1b[36m{}\x1b[0m\n", subject));
            let edges = &self.edges[subject];

            for (i, (consumer, direction)) in edges.iter().enumerate() {
                let prefix = if i == edges.len() - 1 { "└─►" } else { "├─►" };
                let label = match direction {
                    Direction::Subscribe => "\x1b[32mSUB\x1b[0m",
                    Direction::Publish => "\x1b[33mPUB\x1b[0m",
                };
                result.push_str(&format!("  {} {} ({})\n", prefix, consumer, label));
            }
            result.push('\n');
        }

        result
    }
}
