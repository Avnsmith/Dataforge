#!/bin/bash
# DataForge Rollback Wrapper
# Usage: ./rollback.sh
# Requires VPS_PASSWORD in env or input when prompted.

python3 "$(dirname "$0")/rollback.py"
