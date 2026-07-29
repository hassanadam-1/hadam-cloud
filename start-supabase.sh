#!/bin/bash
# Your real Supabase keys live in a SEPARATE file: my-supabase-keys.sh
# That file is never part of what gets shipped in updates, so re-downloading
# a new zip in the future will never overwrite your real keys again — only
# this file (start-supabase.sh) gets replaced, and it just points at your
# keys file rather than containing the keys directly.
#
# First-time setup (only needed once):
#   1. Copy my-supabase-keys.sh.example to my-supabase-keys.sh
#   2. Edit my-supabase-keys.sh with your real values
#   3. From then on, just run: bash start-supabase.sh

if [ ! -f "my-supabase-keys.sh" ]; then
  echo "my-supabase-keys.sh not found."
  echo "Run this once: cp my-supabase-keys.sh.example my-supabase-keys.sh"
  echo "Then edit my-supabase-keys.sh with your real Supabase values."
  exit 1
fi

source my-supabase-keys.sh
echo "HADAM_AUTH_DRIVER is set to: $HADAM_AUTH_DRIVER"
echo "Starting server..."
node server.js
