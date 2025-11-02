#!/bin/bash

# Show project structure

echo "📁 Backend Project Structure"
echo "=============================="
echo ""

if command -v tree &> /dev/null; then
  echo "Using tree command:"
  echo ""
  tree -L 3 -I 'node_modules|.git|.next' -a --dirsfirst 2>/dev/null || tree -L 2 -I 'node_modules|.git' --dirsfirst
else
  echo "Using find command:"
  echo ""
  echo "📂 Root level:"
  ls -1 | grep -v node_modules | grep -v '^\.'
  
  echo ""
  echo "📂 src/ (Core source code):"
  ls -1 src/ 2>/dev/null | head -20
  
  echo ""
  echo "📂 scripts/ (Utility scripts):"
  ls -1 scripts/ 2>/dev/null
  
  echo ""
  echo "📂 prisma/ (Database):"
  ls -1 prisma/ 2>/dev/null | grep -v migrations
  
  echo ""
  echo "📂 foundry-projects/ (Course projects):"
  ls -1 foundry-projects/ 2>/dev/null | head -5
  
  echo ""
  echo "📂 uploads/ (Uploaded files):"
  ls -1 uploads/ 2>/dev/null | head -3
fi

echo ""
echo "📋 For detailed structure, see: PROJECT_STRUCTURE.md"
