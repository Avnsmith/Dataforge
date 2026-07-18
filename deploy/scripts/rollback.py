import os
import re
import sys
import getpass
import paramiko

def get_vps_password():
    password = os.environ.get("VPS_PASSWORD")
    if password:
        return password
    
    try:
        if os.path.exists(".env"):
            with open(".env", "r") as f:
                content = f.read()
            match = re.search(r'^VPS_PASSWORD=["\'\s]?(.*?)["\'\s]?$', content, re.M)
            if match:
                return match.group(1).strip()
    except Exception:
        pass
        
    return getpass.getpass("Enter the VPS root password: ")

def run_remote_command(ssh, cmd):
    print(f"\n[VPS] Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    if out:
        print(out.strip())
    if err:
        print(f"[ERROR] {err.strip()}", file=sys.stderr)
    return out, err, exit_status

def main():
    password = get_vps_password()
    if not password:
        print("Error: VPS password is required to rollback.")
        sys.exit(1)

    host = "152.42.215.193"
    user = "root"

    print(f"Connecting to {user}@{host}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(hostname=host, username=user, password=password, timeout=15)
        print("Connected.")
    except Exception as e:
        print(f"Connection failed: {e}")
        sys.exit(1)

    # Prompt for rollback details (generic/secure)
    rollback_version = input("Enter git commit or tag to rollback to [v0.1.0]: ").strip()
    if not rollback_version:
        rollback_version = "v0.1.0"
        
    db_backup = input("Enter database dump filename to restore (under /opt/dataforge/backups/) [leave blank to skip]: ").strip()

    # 1. Rollback Caddyfile if backup exists
    print("\n--- Checking for Caddyfile backups ---")
    out, err, code = run_remote_command(ssh, "ls -la /opt/fastpay/app/deploy/Caddyfile.backup-*")
    if code == 0:
        print("Found Caddyfile backups. Reverting Caddy to the latest backup...")
        run_remote_command(ssh, "cp $(ls -t /opt/fastpay/app/deploy/Caddyfile.backup-* | head -n 1) /opt/fastpay/app/deploy/Caddyfile")
        print("Validating restored Caddyfile...")
        run_remote_command(ssh, "docker exec -t deploy-caddy-1 caddy validate --config /etc/caddy/Caddyfile")
        print("Reloading Caddy configuration...")
        run_remote_command(ssh, "docker exec -t deploy-caddy-1 caddy reload --config /etc/caddy/Caddyfile")
    else:
        print("No Caddyfile backups found to restore.")

    # 2. Sync codebase on VPS to rollback version
    print(f"\n--- Syncing repository to rollback target {rollback_version} on VPS ---")
    run_remote_command(ssh, "cd /opt/dataforge/app && git fetch --all")
    out_git, err_git, code_git = run_remote_command(ssh, f"cd /opt/dataforge/app && git checkout {rollback_version}")
    if code_git != 0:
        print(f"Failed to check out rollback target: {rollback_version}", file=sys.stderr)
        sys.exit(1)

    # 3. Rebuild and restart containers
    print("\n--- Rebuilding rollback version containers ---")
    run_remote_command(ssh, "cd /opt/dataforge/app/deploy/compose && docker compose build")

    print("\n--- Recreating DataForge rollback version containers ---")
    run_remote_command(ssh, "cd /opt/dataforge/app/deploy/compose && docker compose down && docker compose up -d")

    # 4. Restore database backup if requested
    if db_backup:
        print(f"\n--- Restoring Database Backup: {db_backup} ---")
        restore_cmd = f"docker exec -i dataforge_postgres pg_restore -U postgres -d dataforge -c --clean --if-exists < /opt/dataforge/backups/{db_backup}"
        out_db, err_db, code_db = run_remote_command(ssh, restore_cmd)
        if code_db != 0:
            print(f"Database restore failed: {err_db}", file=sys.stderr)
        else:
            print("Database restore completed successfully.")

    # 5. Clean up network if necessary
    print("\n--- Verifying Caddy Network Attachment ---")
    # Verify Caddy remains connected or disconnects based on target configuration
    run_remote_command(ssh, "docker network connect dataforge_ingress deploy-caddy-1 || true")

    ssh.close()
    print("\nRollback script execution finished.")

if __name__ == "__main__":
    main()
