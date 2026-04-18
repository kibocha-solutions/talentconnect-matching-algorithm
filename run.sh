#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"
LOG_DIR="$PROJECT_DIR/logs"
PID_DIR="$PROJECT_DIR/.dev-pids"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_LOG_FILE="$LOG_DIR/backend.log"
FRONTEND_LOG_FILE="$LOG_DIR/frontend.log"

DEFAULT_BACKEND_HOST="127.0.0.1"
DEFAULT_FRONTEND_HOST="127.0.0.1"

if [[ -t 1 ]]; then
  COLOR_RESET="\033[0m"
  COLOR_RED="\033[0;31m"
  COLOR_GREEN="\033[0;32m"
  COLOR_YELLOW="\033[0;33m"
  COLOR_BLUE="\033[0;34m"
  COLOR_CYAN="\033[0;36m"
  COLOR_BOLD="\033[1m"
else
  COLOR_RESET=""
  COLOR_RED=""
  COLOR_GREEN=""
  COLOR_YELLOW=""
  COLOR_BLUE=""
  COLOR_CYAN=""
  COLOR_BOLD=""
fi

log_info() { printf "%b\n" "${COLOR_BLUE}info${COLOR_RESET} $*"; }
log_success() { printf "%b\n" "${COLOR_GREEN}ok${COLOR_RESET} $*"; }
log_warn() { printf "%b\n" "${COLOR_YELLOW}warn${COLOR_RESET} $*" >&2; }
log_error() { printf "%b\n" "${COLOR_RED}error${COLOR_RESET} $*" >&2; }
log_step() { printf "%b\n" "${COLOR_CYAN}step${COLOR_RESET} $*"; }
timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

read_env_key() {
  local file="$1"
  local wanted_key="$2"
  local line key value

  [[ -f "$file" ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="$(trim "$line")"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    [[ "$line" == export\ * ]] && line="${line#export }"

    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"

    if [[ "$key" == "$wanted_key" ]]; then
      value="${value%\"}"
      value="${value#\"}"
      value="${value%\'}"
      value="${value#\'}"
      printf '%s' "$value"
      return 0
    fi
  done < "$file"

  return 1
}

resolve_setting_from_env_files() {
  local key="$1"
  local value

  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
    return 0
  fi

  for file in "$PROJECT_DIR/.env" "$PROJECT_DIR/.env.local" "$PROJECT_DIR/.env.example"; do
    if value="$(read_env_key "$file" "$key")" && [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done

  return 1
}

resolve_frontend_port_from_package() {
  local script_line start_script
  [[ -f "$FRONTEND_DIR/package.json" ]] || return 1

  script_line="$(grep -E '"start"\s*:' "$FRONTEND_DIR/package.json" | head -n 1 || true)"
  [[ -n "$script_line" ]] || return 1

  start_script="$(printf '%s' "$script_line" | sed -E 's/^[[:space:]]*"start"[[:space:]]*:[[:space:]]*"(.*)"[[:space:]]*,?[[:space:]]*$/\1/')"

  if [[ "$start_script" =~ -p[[:space:]]*([0-9]{2,5}) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$start_script" =~ --port[[:space:]]*([0-9]{2,5}) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$start_script" =~ --port=([0-9]{2,5}) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi

  return 1
}

resolve_backend_host() {
  if resolve_setting_from_env_files BACKEND_HOST; then
    return 0
  fi
  printf '%s' "$DEFAULT_BACKEND_HOST"
}

resolve_frontend_host() {
  if resolve_setting_from_env_files FRONTEND_HOST; then
    return 0
  fi
  printf '%s' "$DEFAULT_FRONTEND_HOST"
}

resolve_backend_port() {
  if resolve_setting_from_env_files BACKEND_PORT; then
    return 0
  fi
  log_error "BACKEND_PORT is not configured in environment or env files."
  exit 1
}

resolve_frontend_port() {
  if [[ -n "${FRONTEND_PORT:-}" ]]; then
    printf '%s' "$FRONTEND_PORT"
    return 0
  fi

  if resolve_frontend_port_from_package; then
    return 0
  fi

  if resolve_setting_from_env_files FRONTEND_PORT; then
    return 0
  fi

  log_error "FRONTEND_PORT could not be resolved from package.json start script or env files."
  exit 1
}

BACKEND_HOST="$(resolve_backend_host)"
BACKEND_PORT="$(resolve_backend_port)"
FRONTEND_HOST="$(resolve_frontend_host)"
FRONTEND_PORT="$(resolve_frontend_port)"

display_host() {
  local host="$1"
  if [[ "$host" == "0.0.0.0" || "$host" == "::" ]]; then
    printf 'localhost'
    return 0
  fi
  printf '%s' "$host"
}

backend_url() {
  printf 'http://%s:%s' "$(display_host "$BACKEND_HOST")" "$BACKEND_PORT"
}

frontend_url() {
  printf 'http://%s:%s' "$(display_host "$FRONTEND_HOST")" "$FRONTEND_PORT"
}

ensure_directories() {
  mkdir -p "$LOG_DIR" "$PID_DIR"
}

read_pid_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    tr -d '[:space:]' < "$file"
  fi
}

is_process_running() {
  local pid="$1"
  [[ -n "$pid" ]] && ps -p "$pid" >/dev/null 2>&1
}

process_command() {
  local pid="$1"
  ps -p "$pid" -o command= 2>/dev/null | sed -E 's/^[[:space:]]+//'
}

is_descendant_of() {
  local candidate_pid="$1"
  local ancestor_pid="$2"
  local current ppid

  [[ -n "$candidate_pid" && -n "$ancestor_pid" ]] || return 1
  [[ "$candidate_pid" =~ ^[0-9]+$ && "$ancestor_pid" =~ ^[0-9]+$ ]] || return 1

  current="$candidate_pid"
  while [[ "$current" -gt 1 ]]; do
    if [[ "$current" == "$ancestor_pid" ]]; then
      return 0
    fi
    ppid="$(ps -p "$current" -o ppid= 2>/dev/null | tr -d '[:space:]')"
    [[ -n "$ppid" && "$ppid" =~ ^[0-9]+$ ]] || break
    if [[ "$ppid" == "$ancestor_pid" ]]; then
      return 0
    fi
    current="$ppid"
  done

  return 1
}

port_listener_pid() {
  local port="$1"
  local pid=""

  if has_command lsof; then
    pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2}')"
    if [[ -n "$pid" ]]; then
      printf '%s' "$pid"
      return 0
    fi
  fi

  if has_command fuser; then
    pid="$(fuser -n tcp "$port" 2>/dev/null | awk '{print $1}')"
    if [[ -n "$pid" ]]; then
      printf '%s' "$pid"
      return 0
    fi
  fi

  if has_command ss; then
    pid="$(ss -ltnp 2>/dev/null | awk -v target=":$port" '$4 ~ target"$" {print $NF; exit}' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p')"
    if [[ -n "$pid" ]]; then
      printf '%s' "$pid"
      return 0
    fi
  fi

  return 1
}

service_pid_file() {
  case "$1" in
    backend) printf '%s' "$BACKEND_PID_FILE" ;;
    frontend) printf '%s' "$FRONTEND_PID_FILE" ;;
    *) return 1 ;;
  esac
}

service_port() {
  case "$1" in
    backend) printf '%s' "$BACKEND_PORT" ;;
    frontend) printf '%s' "$FRONTEND_PORT" ;;
    *) return 1 ;;
  esac
}

service_url() {
  case "$1" in
    backend) printf '%s' "$(backend_url)" ;;
    frontend) printf '%s' "$(frontend_url)" ;;
    *) return 1 ;;
  esac
}

service_health_url() {
  case "$1" in
    backend) printf '%s/health' "$(backend_url)" ;;
    frontend) printf '%s/' "$(frontend_url)" ;;
    *) return 1 ;;
  esac
}

is_service_healthy() {
  local service="$1"
  local url
  url="$(service_health_url "$service")"

  if ! has_command curl; then
    return 1
  fi

  curl --silent --show-error --fail --max-time 4 "$url" >/dev/null 2>&1
}

wait_until_healthy() {
  local service="$1"
  local timeout_seconds="${2:-20}"
  local elapsed=0

  while [[ "$elapsed" -lt "$timeout_seconds" ]]; do
    if is_service_healthy "$service"; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

write_log_header() {
  local log_file="$1"
  local label="$2"
  {
    echo ""
    echo "=== $label started at $(timestamp) ==="
  } >> "$log_file"
}

start_detached() {
  local workdir="$1"
  local log_file="$2"
  local pid_file="$3"
  shift 3

  if has_command setsid; then
    (
      cd "$workdir"
      setsid "$@" >> "$log_file" 2>&1 < /dev/null &
      echo "$!" > "$pid_file"
    )
    return 0
  fi

  (
    cd "$workdir"
    nohup "$@" >> "$log_file" 2>&1 < /dev/null &
    echo "$!" > "$pid_file"
  )
}

ensure_backend_dependencies() {
  if [[ ! -x "$PROJECT_DIR/.venv/bin/python" ]]; then
    log_error "Python virtualenv not found at .venv."
    log_info "Create it with: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-lock.txt"
    exit 1
  fi
}

ensure_frontend_dependencies() {
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log_error "Frontend dependencies are missing."
    log_info "Install them with: cd frontend && npm install"
    exit 1
  fi
}

frontend_build_marker() {
  printf '%s' "$FRONTEND_DIR/.next/BUILD_ID"
}

is_frontend_built() {
  [[ -f "$(frontend_build_marker)" ]]
}

build_frontend() {
  local force="$1"
  ensure_frontend_dependencies

  if [[ "$force" == "true" ]]; then
    log_step "Building frontend (forced)"
    (cd "$FRONTEND_DIR" && npm run build)
    return 0
  fi

  if is_frontend_built; then
    log_info "Frontend build artifact found. Skipping build."
    return 0
  fi

  log_step "Frontend build artifact not found. Building frontend."
  (cd "$FRONTEND_DIR" && npm run build)
}

kill_pid_gracefully() {
  local pid="$1"
  local label="$2"
  local waited=0

  if ! is_process_running "$pid"; then
    return 0
  fi

  log_step "Stopping $label PID $pid"
  kill -TERM "$pid" 2>/dev/null || true

  while is_process_running "$pid" && [[ "$waited" -lt 8 ]]; do
    sleep 1
    waited=$((waited + 1))
  done

  if is_process_running "$pid"; then
    log_warn "$label PID $pid did not stop gracefully. Forcing kill."
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

kill_port_listener() {
  local port="$1"
  local service="$2"
  local force_all="$3"
  local listener_pid commissioned_pid commissioned_health
  local pid_file

  listener_pid="$(port_listener_pid "$port" || true)"
  [[ -n "$listener_pid" ]] || return 0

  pid_file="$(service_pid_file "$service")"
  commissioned_pid="$(read_pid_file "$pid_file")"
  commissioned_health="false"
  if [[ -n "$commissioned_pid" ]] && is_process_running "$commissioned_pid"; then
    if is_service_healthy "$service"; then
      commissioned_health="true"
    fi
  fi

  if [[ "$force_all" != "true" && "$commissioned_health" == "true" ]] && \
    ([[ "$listener_pid" == "$commissioned_pid" ]] || is_descendant_of "$listener_pid" "$commissioned_pid"); then
    log_info "$service already commissioned and healthy on port $port (PID $listener_pid)."
    return 0
  fi

  log_warn "Port $port is occupied by PID $listener_pid ($(process_command "$listener_pid" || echo unknown))."
  kill_pid_gracefully "$listener_pid" "port $port listener"

  if [[ "$listener_pid" == "$commissioned_pid" ]] || is_descendant_of "$listener_pid" "$commissioned_pid"; then
    rm -f "$pid_file"
  fi
}

kill_blockers_for_target() {
  local target="$1"
  local force_all="$2"

  case "$target" in
    all)
      kill_port_listener "$BACKEND_PORT" backend "$force_all"
      kill_port_listener "$FRONTEND_PORT" frontend "$force_all"
      ;;
    backend)
      kill_port_listener "$BACKEND_PORT" backend "$force_all"
      ;;
    frontend)
      kill_port_listener "$FRONTEND_PORT" frontend "$force_all"
      ;;
    *)
      log_error "Unknown target '$target'. Use all, backend, or frontend."
      exit 1
      ;;
  esac
}

start_backend_service() {
  local pid
  ensure_backend_dependencies
  pid="$(read_pid_file "$BACKEND_PID_FILE")"

  if [[ -n "$pid" ]] && is_process_running "$pid" && is_service_healthy backend; then
    log_info "backend is already running and healthy (PID $pid)."
    return 0
  fi

  rm -f "$BACKEND_PID_FILE"
  write_log_header "$BACKEND_LOG_FILE" "Backend"

  log_step "Starting backend in production mode on $(backend_url)"
  start_detached "$PROJECT_DIR" "$BACKEND_LOG_FILE" "$BACKEND_PID_FILE" \
    "$PROJECT_DIR/.venv/bin/python" -m uvicorn app.main:app \
    --host "$BACKEND_HOST" \
    --port "$BACKEND_PORT"

  if wait_until_healthy backend 25; then
    log_success "backend healthy at $(backend_url)"
    return 0
  fi

  log_error "backend did not become healthy."
  log_info "Inspect logs with: ./run.sh logs backend --follow"
  exit 1
}

start_frontend_service() {
  local pid
  ensure_frontend_dependencies
  pid="$(read_pid_file "$FRONTEND_PID_FILE")"

  if [[ -n "$pid" ]] && is_process_running "$pid" && is_service_healthy frontend; then
    log_info "frontend is already running and healthy (PID $pid)."
    return 0
  fi

  rm -f "$FRONTEND_PID_FILE"
  write_log_header "$FRONTEND_LOG_FILE" "Frontend"

  log_step "Starting frontend in production mode on $(frontend_url)"
  start_detached "$FRONTEND_DIR" "$FRONTEND_LOG_FILE" "$FRONTEND_PID_FILE" \
    npm run start -- --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"

  if wait_until_healthy frontend 25; then
    log_success "frontend healthy at $(frontend_url)"
    return 0
  fi

  log_error "frontend did not become healthy."
  log_info "Inspect logs with: ./run.sh logs frontend --follow"
  exit 1
}

stop_service() {
  local service="$1"
  local pid_file pid
  pid_file="$(service_pid_file "$service")"
  pid="$(read_pid_file "$pid_file")"

  if [[ -n "$pid" ]] && is_process_running "$pid"; then
    kill_pid_gracefully "$pid" "$service"
  fi

  kill_blockers_for_target "$service" true
  rm -f "$pid_file"
  log_success "$service stopped"
}

show_status_for() {
  local service="$1"
  local port pid_file pid listener_pid listener_cmd url health_text
  port="$(service_port "$service")"
  pid_file="$(service_pid_file "$service")"
  pid="$(read_pid_file "$pid_file")"
  listener_pid="$(port_listener_pid "$port" || true)"
  listener_cmd=""
  url="$(service_url "$service")"

  if [[ -n "$listener_pid" ]]; then
    listener_cmd="$(process_command "$listener_pid" || true)"
  fi

  if is_service_healthy "$service"; then
    health_text="healthy"
  else
    health_text="unhealthy"
  fi

  printf "\n"
  printf "%b\n" "${COLOR_BOLD}${service^^}${COLOR_RESET}"
  log_info "URL: $url"
  log_info "Port: $port"
  if [[ -n "$pid" ]]; then
    if is_process_running "$pid"; then
      log_info "Managed PID: $pid ($(process_command "$pid" || echo unknown))"
    else
      log_warn "Managed PID file exists but process is not running: $pid"
      rm -f "$pid_file"
    fi
  else
    log_warn "Managed PID: none"
  fi

  if [[ -n "$listener_pid" ]]; then
    if [[ "$listener_pid" == "$pid" ]] || is_descendant_of "$listener_pid" "$pid"; then
      log_success "Port owner: PID $listener_pid (commissioned by this script)"
    else
      log_warn "Port owner: PID $listener_pid (external process)"
    fi
    log_info "Port owner command: ${listener_cmd:-unknown}"
  else
    log_warn "Port owner: none (nothing listening on port $port)"
  fi

  if [[ "$health_text" == "healthy" ]]; then
    log_success "Health: healthy"
  else
    log_warn "Health: unhealthy"
  fi
}

show_urls_for() {
  case "$1" in
    backend)
      log_info "Backend:  ${COLOR_BOLD}$(backend_url)${COLOR_RESET}"
      log_info "API docs: ${COLOR_BOLD}$(backend_url)/docs${COLOR_RESET}"
      ;;
    frontend)
      log_info "Frontend: ${COLOR_BOLD}$(frontend_url)${COLOR_RESET}"
      ;;
  esac
}

show_logs_for() {
  local service="$1"
  local follow="$2"
  local log_file

  case "$service" in
    backend) log_file="$BACKEND_LOG_FILE" ;;
    frontend) log_file="$FRONTEND_LOG_FILE" ;;
    *) log_error "Unknown logs target '$service'."; exit 1 ;;
  esac

  if [[ ! -f "$log_file" ]]; then
    log_warn "No $service log file found at $log_file."
    return 0
  fi

  log_info "$service log: $log_file"
  if [[ "$follow" == "true" ]]; then
    tail -n 120 -f "$log_file"
  else
    tail -n 120 "$log_file"
  fi
}

is_target() {
  case "$1" in
    all|backend|frontend) return 0 ;;
    *) return 1 ;;
  esac
}

for_services() {
  local target="$1"
  local callback="$2"

  case "$target" in
    all)
      "$callback" backend
      "$callback" frontend
      ;;
    backend|frontend)
      "$callback" "$target"
      ;;
    *)
      log_error "Unknown target '$target'. Use all, backend, or frontend."
      exit 1
      ;;
  esac
}

ensure_build_policy() {
  local target="$1"
  local force="$2"

  case "$target" in
    all|frontend)
      build_frontend "$force"
      ;;
    backend)
      log_info "Backend has no separate build artifact step in this script."
      ;;
  esac
}

start_service() {
  case "$1" in
    backend) start_backend_service ;;
    frontend) start_frontend_service ;;
  esac
}

cmd_start() {
  local target="$1"
  ensure_directories

  log_step "Start preflight: build check"
  ensure_build_policy "$target" false

  log_step "Start preflight: current status"
  for_services "$target" show_status_for

  log_step "Start preflight: kill blocking port listeners"
  kill_blockers_for_target "$target" false

  log_step "Start: launching target services"
  for_services "$target" start_service

  log_step "Start verification"
  for_services "$target" show_status_for
  for_services "$target" show_urls_for
}

cmd_restart() {
  local target="$1"
  ensure_directories

  log_step "Restart preflight: dependency and build checks"
  ensure_build_policy "$target" true

  log_step "Restart preflight: kill all listeners on managed ports"
  kill_blockers_for_target "$target" true

  log_step "Restart: launching target services"
  for_services "$target" start_service

  log_step "Restart verification"
  for_services "$target" show_status_for
  for_services "$target" show_urls_for
}

cmd_stop() {
  local target="$1"
  ensure_directories

  log_step "Stopping target services and killing all listeners on managed ports"
  for_services "$target" stop_service

  log_step "Stop verification"
  for_services "$target" show_status_for
}

cmd_status() {
  for_services "$1" show_status_for
}

cmd_urls() {
  for_services "$1" show_urls_for
}

cmd_build() {
  local target="$1"
  ensure_directories

  log_step "Build preflight: status"
  for_services "$target" show_status_for

  log_step "Build: forcing rebuild"
  ensure_build_policy "$target" true

  log_step "Build post-step: kill all listeners on managed ports"
  kill_blockers_for_target "$target" true

  log_success "Build flow completed for target '$target'."
}

cmd_logs() {
  local target="$1"
  local follow="${2:-false}"

  case "$target" in
    all)
      show_logs_for backend false
      show_logs_for frontend "$follow"
      ;;
    backend|frontend)
      show_logs_for "$target" "$follow"
      ;;
    *)
      log_error "Unknown target '$target'. Use all, backend, or frontend."
      exit 1
      ;;
  esac
}

is_command() {
  case "$1" in
    start|stop|restart|status|logs|build|urls|connect|help|--help|-h) return 0 ;;
    *) return 1 ;;
  esac
}

print_help() {
  cat <<USAGE
Usage:
  ./run.sh <command> [target] [options]
  ./run.sh <target> <command> [options]

Commands:
  start [all|backend|frontend]     Production start flow
  stop [all|backend|frontend]      Kill commissioned and blocking processes
  restart [all|backend|frontend]   Forced rebuild + kill + start flow
  status [all|backend|frontend]    Actionable process and health status
  logs [all|backend|frontend]      Show recent logs
  logs <target> --follow           Follow logs for a service
  urls [all|backend|frontend]      Print connection URLs
  connect [all|backend|frontend]   Alias for urls
  build [all|backend|frontend]     Force build then clear managed ports

Behavior defaults:
  If no target is provided, target defaults to 'all' (backend + frontend).

Start flow:
  1) build check (auto-build if needed)
  2) status check
  3) kill blocking listeners
  4) start services in production mode
  5) health verification and feedback

Restart flow:
  1) preflight
  2) force build
  3) kill all listeners on managed ports
  4) start services
  5) health verification and feedback

Build flow:
  1) status check
  2) force build
  3) clear listeners on managed ports
  4) feedback

Port resolution:
  - Frontend port: FRONTEND_PORT env override, else frontend/package.json start script, else env files
  - Backend port:  BACKEND_PORT from env or env files

Current resolved URLs:
  Frontend: $(frontend_url)
  Backend:  $(backend_url)
USAGE
}

main() {
  local cmd="${1:-help}"
  local target="all"
  local follow="false"

  if is_target "$cmd" && [[ $# -ge 2 ]] && is_command "$2"; then
    target="$cmd"
    cmd="$2"
    shift 2
  else
    shift || true
    if [[ $# -ge 1 ]] && is_target "$1"; then
      target="$1"
      shift
    fi
  fi

  if [[ "${1:-}" == "--follow" || "${1:-}" == "-f" ]]; then
    follow="true"
  fi

  case "$cmd" in
    start) cmd_start "$target" ;;
    stop) cmd_stop "$target" ;;
    restart) cmd_restart "$target" ;;
    status) cmd_status "$target" ;;
    urls|connect) cmd_urls "$target" ;;
    logs) cmd_logs "$target" "$follow" ;;
    build) cmd_build "$target" ;;
    help|--help|-h) print_help ;;
    *)
      log_error "Unknown command '$cmd'."
      print_help
      exit 1
      ;;
  esac
}

main "$@"
