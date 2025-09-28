#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 [user@host] [fs_conf_dir] | $0 docker" >&2
  echo "  For Docker: $0 docker" >&2
  echo "  For native FS: $0 user@host /etc/freeswitch" >&2
  exit 1
fi

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$1" = "docker" ]; then
  echo "Deploying to FreeSWITCH Docker container..." >&2
  
  # Check if container exists
  if ! sudo docker ps -a --format '{{.Names}}' | grep -q "^freeswitch$"; then
    echo "FreeSWITCH container not found. Please run:" >&2
    echo "sudo docker run -d --name freeswitch -p 5060:5060/tcp -p 5060:5060/udp -p 5080:5080/tcp -p 5080:5080/udp -p 8021:8021/tcp -p 16384-32768:16384-32768/udp freeswitch/freeswitch:latest" >&2
    exit 1
  fi
  
  echo "Copying gateway XML to container" >&2
  sudo docker cp "$BASE_DIR/freeswitch/didlogic.xml" freeswitch:/usr/local/freeswitch/conf/sip_profiles/external/didlogic.xml
  
  echo "Copying event_socket config to container" >&2
  sudo docker cp "$BASE_DIR/freeswitch/autoload_configs/event_socket.conf.xml" freeswitch:/usr/local/freeswitch/conf/autoload_configs/event_socket.conf.xml
  
  echo "Copying vars overrides to container" >&2
  sudo docker cp "$BASE_DIR/freeswitch/vars.xml" freeswitch:/usr/local/freeswitch/conf/vars.xml
  
  echo "Copying inbound dialplan to container" >&2
  sudo docker cp "$BASE_DIR/freeswitch/dialplan/public_did.xml" freeswitch:/usr/local/freeswitch/conf/dialplan/public/public_did.xml
  
  echo "Restarting FreeSWITCH container to apply changes" >&2
  sudo docker restart freeswitch
  
  echo "Waiting for FreeSWITCH to start..." >&2
  sleep 10
  
  echo "Checking gateway status..." >&2
  sudo docker exec freeswitch fs_cli -x 'sofia profile external rescan'
  sudo docker exec freeswitch fs_cli -x 'sofia status gateway didlogic'
  
else
  # Native FreeSWITCH deployment
  TARGET="$1"
  FS_CONF_DIR="${2:-/etc/freeswitch}"
  
  echo "Backing up remote XML directories..." >&2
  ssh "$TARGET" "sudo mkdir -p $FS_CONF_DIR/backup && sudo cp -a $FS_CONF_DIR/sip_profiles/external $FS_CONF_DIR/backup/external_$(date +%s) || true"
  
  echo "Deploying gateway XML" >&2
  scp "$BASE_DIR/freeswitch/didlogic.xml" "$TARGET:$FS_CONF_DIR/sip_profiles/external/didlogic.xml"
  
  echo "Deploying event_socket config" >&2
  scp "$BASE_DIR/freeswitch/autoload_configs/event_socket.conf.xml" "$TARGET:$FS_CONF_DIR/autoload_configs/event_socket.conf.xml"
  
  echo "Deploying vars overrides" >&2
  scp "$BASE_DIR/freeswitch/vars.xml" "$TARGET:$FS_CONF_DIR/vars.xml"
  
  echo "Deploying inbound public dialplan for DID" >&2
  scp "$BASE_DIR/freeswitch/dialplan/public_did.xml" "$TARGET:$FS_CONF_DIR/dialplan/public/public_did.xml"
  
  echo "Reloading FreeSWITCH config and external profile" >&2
  ssh "$TARGET" "sudo fs_cli -x 'reloadxml' && sudo fs_cli -x 'sofia profile external rescan' && sudo fs_cli -x 'sofia status gateway didlogic'"
fi

