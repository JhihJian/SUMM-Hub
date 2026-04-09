#!/bin/bash
set -e

# Parse message content
content=$(jq -r '.content')

# Send to DingTalk webhook
curl -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=${DINGTALK_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"【通知】${content}\"}}"
