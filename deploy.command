#!/bin/bash
cd '/Users/diegovelez/Claude/Projects/world cup app'
echo "🚀 Deploying World Cup app to Vercel..."
echo ""
# Use npx so no global install / admin rights are needed.
if command -v vercel &> /dev/null; then
  vercel --prod
else
  echo "Using npx (downloads Vercel CLI on the fly, no admin needed)…"
  echo "If this is the first time, it may ask you to log in — follow the prompt in this window."
  echo ""
  npx --yes vercel@latest --prod
fi
echo ""
echo "✅ Done! Press any key to close this window."
read -n 1
