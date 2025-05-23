#!/bin/bash

echo "Setting up BRD Generator application..."

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Install backend dependencies
echo "Installing backend dependencies..."
cd server
npm install
pip install -r requirements.txt
cd ..

echo "Setup complete! Run 'make start' to start the application." 