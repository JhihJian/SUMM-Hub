#!/bin/bash
# Mock AI Response Script for E2E Testing
# Reads message from stdin, parses session_id, publishes echo response to summ.ai.output
#
# Usage: cat message.json | NATS_URL=nats://localhost:6422 ./mock-ai-response.sh
#
# Input format (from summ.ai.input):
#   {"id":"msg-xxx","session_id":"sess_xxx","content":{"text":"hello"},"context":{},"timestamp":123}
#
# Output format (to summ.ai.output):
#   {"session_id":"sess_xxx","message_id":"msg-xxx","timestamp":123,"type":"content","content":"Echo: hello"}
#   {"session_id":"sess_xxx","message_id":"msg-xxx-done","timestamp":123,"type":"done"}

set -e

NATS_URL="${NATS_URL:-nats://localhost:6422}"
OUTPUT_SUBJECT="summ.ai.output"

# Read message from stdin
MESSAGE=$(cat)

# Parse fields using jq (fallback to grep if jq not available)
if command -v jq &> /dev/null; then
  SESSION_ID=$(echo "$MESSAGE" | jq -r '.session_id // "unknown"')
  MESSAGE_ID=$(echo "$MESSAGE" | jq -r '.id // "unknown"')
  TEXT=$(echo "$MESSAGE" | jq -r '.content.text // ""')
else
  # Fallback: simple grep-based parsing
  SESSION_ID=$(echo "$MESSAGE" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
  MESSAGE_ID=$(echo "$MESSAGE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
  TEXT=$(echo "$MESSAGE" | grep -o '"text":"[^"]*"' | cut -d'"' -f4 || echo "")
fi

TIMESTAMP=$(date +%s)000

echo "[mock-ai] Received message for session: $SESSION_ID"
echo "[mock-ai] Text: $TEXT"

# Generate response
RESPONSE_MESSAGE_ID="${MESSAGE_ID}-response"
DONE_MESSAGE_ID="${MESSAGE_ID}-done"

# Publish content response
CONTENT_RESPONSE=$(cat <<EOF
{"session_id":"$SESSION_ID","message_id":"$RESPONSE_MESSAGE_ID","timestamp":$TIMESTAMP,"type":"content","content":"Echo: $TEXT"}
EOF
)

echo "[mock-ai] Publishing content response..."
nats pub "$OUTPUT_SUBJECT" "$CONTENT_RESPONSE" -s "$NATS_URL"

# Publish done marker
DONE_RESPONSE=$(cat <<EOF
{"session_id":"$SESSION_ID","message_id":"$DONE_MESSAGE_ID","timestamp":$TIMESTAMP,"type":"done"}
EOF
)

echo "[mock-ai] Publishing done marker..."
nats pub "$OUTPUT_SUBJECT" "$DONE_RESPONSE" -s "$NATS_URL"

echo "[mock-ai] Response complete"
