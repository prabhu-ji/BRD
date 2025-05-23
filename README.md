# Business Requirements Document (BRD) Generator

A web application for creating, managing, and generating Business Requirements Documents.

## Features

- Create and manage templates for BRDs
- Add custom inputs and outputs
- Support for technical documentation including CSV, images, and documents
- Drag-and-drop interface for organizing BRD sections
- Convert CSV data to formatted tables
- Generate professional BRD documents

## Tech Stack

- Frontend: React with Tailwind CSS
- Backend: Node.js with Express
- Document Generation: Python with docx
- Data Format: JSON for configuration and storage

## Setup

### Server Setup

```bash
cd brd/server
npm install
node server.js
```

### Client Setup

```bash
cd brd/client
npm install
npm run dev
```

## Usage

1. Configure inputs and outputs
2. Create templates with the desired fields
3. Create BRDs using the templates
4. Generate and download the final BRD 