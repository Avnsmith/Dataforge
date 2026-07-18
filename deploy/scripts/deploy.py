import os
import re
import sys
import getpass
import paramiko

def get_vps_password():
    # Try reading from environment variable first
    password = os.environ.get("VPS_PASSWORD")
    if password:
        return password
    
    # Try reading from local .env
    try:
        if os.path.exists(".env"):
            with open(".env", "r") as f:
                content = f.read()
            match = re.search(r'^VPS_PASSWORD=["\'\s]?(.*?)["\'\s]?$', content, re.M)
            if match:
                return match.group(1).strip()
    except Exception:
        pass
        
    # Interactive prompt (generic/secure)
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
        print("Error: VPS password is required to deploy.")
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

    # Ask for deploy target (generic/secure)
    deploy_target = input("Enter git commit or tag to deploy [v0.1.0]: ").strip()
    if not deploy_target:
        deploy_target = "v0.1.0"

    # 1. Pull/Sync code to /opt/dataforge/app
    print(f"\n--- Syncing repository to {deploy_target} on VPS ---")
    run_remote_command(ssh, "cd /opt/dataforge/app && git fetch --all")
    out, err, code = run_remote_command(ssh, f"cd /opt/dataforge/app && git checkout {deploy_target}")
    if code != 0:
        print(f"Failed to check out deployment target: {deploy_target}", file=sys.stderr)
        sys.exit(1)

    # 2. Re-create /opt/dataforge layout just in case
    print("\n--- Verifying VPS directory layout permissions ---")
    run_remote_command(ssh, "chown -R dataforge:dataforge /opt/dataforge")
    run_remote_command(ssh, "chmod 750 /opt/dataforge")
    run_remote_command(ssh, "chmod 700 /opt/dataforge/env /opt/dataforge/backups")

    # 3. Create networks if not exist
    print("\n--- Creating Docker Networks ---")
    run_remote_command(ssh, "docker network create dataforge_ingress || true")

    # 4. Build and start compose stack sequentially
    print("\n--- Building DataForge production containers ---")
    run_remote_command(ssh, "cd /opt/dataforge/app/deploy/compose && docker compose build")

    print("\n--- Recreating DataForge production containers ---")
    run_remote_command(ssh, "cd /opt/dataforge/app/deploy/compose && docker compose up -d")

    # 5. Run database migrations
    print("\n--- Running Database Migrations ---")
    run_remote_command(ssh, "docker exec -i dataforge_api npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma")

    ssh.close()
    print("\nDeploy script execution finished.")

if __name__ == "__main__":
    main()
