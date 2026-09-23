#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/envvault-sftp.XXXXXX")"
sshd_pid=""

cleanup() {
  if [[ -n "$sshd_pid" ]] && kill -0 "$sshd_pid" 2>/dev/null; then
    kill "$sshd_pid"
    wait "$sshd_pid" 2>/dev/null || true
  fi
  rm -rf "$test_root"
}
trap cleanup EXIT INT TERM

for command in sshd ssh-keygen ruby nc; do
  command -v "$command" >/dev/null || {
    echo "missing required local test command: $command" >&2
    exit 1
  }
done

port="$(ruby -rsocket -e 'server = TCPServer.new("127.0.0.1", 0); puts server.addr[1]; server.close')"
username="$(id -un)"
host_key="$test_root/host_ed25519"
client_key="$test_root/client_ed25519"
remote_path="$test_root/remote-vault"

ssh-keygen -q -t ed25519 -N "" -C "envvault-fictitious-loopback-host" -f "$host_key"
ssh-keygen -q -t ed25519 -N "" -C "envvault-fictitious-loopback-client" -f "$client_key"
chmod 600 "$client_key" "$client_key.pub"
mkdir -m 700 "$remote_path"

sshd_binary="$(command -v sshd)"
"$sshd_binary" -D -e -f /dev/null \
  -o "Port=$port" \
  -o "ListenAddress=127.0.0.1" \
  -o "HostKey=$host_key" \
  -o "PidFile=$test_root/sshd.pid" \
  -o "AuthorizedKeysFile=$client_key.pub" \
  -o "StrictModes=no" \
  -o "PasswordAuthentication=no" \
  -o "KbdInteractiveAuthentication=no" \
  -o "PubkeyAuthentication=yes" \
  -o "UsePAM=no" \
  -o "LogLevel=ERROR" \
  -o "Subsystem=sftp internal-sftp" &
sshd_pid=$!

for _ in {1..50}; do
  if nc -z 127.0.0.1 "$port" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$sshd_pid" 2>/dev/null; then
    echo "ephemeral sshd exited before accepting connections" >&2
    exit 1
  fi
  sleep 0.1
done
nc -z 127.0.0.1 "$port" 2>/dev/null || {
  echo "ephemeral sshd did not become ready" >&2
  exit 1
}

fingerprint="$(ssh-keygen -lf "$host_key.pub" -E sha256 | awk '{print $2}')"
cd "$repo_root"
ENVAULT_RUN_SFTP_ACCEPTANCE=1 \
ENVAULT_SFTP_HOST=127.0.0.1 \
ENVAULT_SFTP_PORT="$port" \
ENVAULT_SFTP_USERNAME="$username" \
ENVAULT_SFTP_PRIVATE_KEY="$client_key" \
ENVAULT_SFTP_HOST_KEY="$fingerprint" \
ENVAULT_SFTP_REMOTE_PATH="$remote_path" \
cargo test -p envvault-core --test sftp_acceptance -- --nocapture
