# BRD Generator

A powerful application for creating Business Requirements Documents using templates and AI-powered content generation.

## Features

-   📝 Dynamically configure inputs and outputs for BRD templates
-   🧩 Build reusable BRD templates with custom fields
-   📊 Support for various input types: text, textarea, date, dropdowns, file uploads
-   🤖 AI-powered content generation based on business logic and use cases
-   📋 CSV to table conversion for data visualization
-   🖼️ Image embedding for system diagrams
-   📄 PDF document reference support
-   🔄 Drag-and-drop section reordering
-   📥 Export to PDF format

## Requirements

-   Node.js 14+ and npm
-   Python 3.8+
-   Make (optional, for using the Makefile commands)

## Installation

### Manual Installation

1. Clone the repository:

    ```
    git clone https://github.com/yourusername/brd-generator.git
    cd brd-generator
    ```

2. Install frontend dependencies:

    ```
    cd frontend
    npm install
    cd ..
    ```

3. Install backend dependencies:
    ```
    cd server
    npm install
    pip install -r requirements.txt
    cd ..
    ```

### Using Makefile (Recommended)

Simply run:

```
make setup
```

This will install all dependencies for both frontend and backend.

## Usage

### Using Makefile (Recommended)

Start both frontend and backend servers:

```
make start
```

Or start them individually:

```
make start-frontend
make start-backend
```

### Manual Start

1. Start the frontend:

    ```
    cd frontend
    npm run dev
    ```

2. In a separate terminal, start the backend:

    ```
    cd server
    npm run dev
    ```

3. Open your browser and navigate to http://localhost:5173

## Application Workflow

1. **Home Page (Configuration)**: Define input types and output sections
2. **Template Builder**: Create reusable templates using the defined inputs/outputs
3. **Create BRD**: Fill in the template, upload files, and provide business logic
4. **Generate BRD**: The application will generate a professional BRD document with AI-powered content

## Technologies Used

-   **Frontend**: React, Tailwind CSS, React Router, React Beautiful DnD
-   **Backend**: Node.js, Express, Multer for file uploads
-   **Document Generation**: Python with python-docx, pandas, OpenAI API integration

## License

MIT
