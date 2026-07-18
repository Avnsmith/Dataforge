#!/bin/bash
# DataForge Deployment Wrapper
# Usage: ./deploy.sh
# Requires VPS_PASSWORD in env or input when prompted.

python3 "$(dirname "$0")/deploy.py"
