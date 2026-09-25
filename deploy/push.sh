#!/bin/sh
# From your computer: ship the committed code to the server and rebuild.
#   sh deploy/push.sh root@<server-ip>          (first time add: setup)
set -eu
HOST=$1
cd "$(dirname "$0")/.."
git archive HEAD | ssh -i ~/.ssh/sapna_deploy "$HOST" "mkdir -p /opt/sapna && tar -x -C /opt/sapna"
if [ "${2:-}" = setup ]; then
  ssh -i ~/.ssh/sapna_deploy "$HOST" "sh /opt/sapna/deploy/setup.sh"
else
  ssh -i ~/.ssh/sapna_deploy "$HOST" "sh /opt/sapna/deploy/update.sh"
fi
