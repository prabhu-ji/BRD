const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { PythonShell } = require('python-shell');

const app = express();
const PORT = process.env.PORT || 5555;
const API_KEY = "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";

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const GENERATED_DIR = path.join(__dirname, 'generated');
const PYTHON_SCRIPT_PATH = path.join(__dirname, 'generate_brd.py');


fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(GENERATED_DIR);


if (!fs.existsSync(PYTHON_SCRIPT_PATH)) {
  createPythonScript();
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const sessionId = uuidv4();
    const sessionDir = path.join(UPLOADS_DIR, sessionId);
    fs.ensureDirSync(sessionDir);

    req.sessionDir = sessionDir;
    cb(null, sessionDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/generated', express.static(GENERATED_DIR));


const configDir = path.join(__dirname, 'config');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

const inputConfigPath = path.join(configDir, 'configInput.json');
const outputConfigPath = path.join(configDir, 'configOutput.json');
const templatesConfigPath = path.join(configDir, 'templates.json');

// Initialize config files if they don't exist
if (!fs.existsSync(inputConfigPath)) {
  fs.writeFileSync(inputConfigPath, JSON.stringify({}), 'utf8');
}

if (!fs.existsSync(outputConfigPath)) {
  fs.writeFileSync(outputConfigPath, JSON.stringify({}), 'utf8');
}

if (!fs.existsSync(templatesConfigPath)) {
  fs.writeFileSync(templatesConfigPath, JSON.stringify([]), 'utf8');
}

// Configuration API endpoints
app.get('/api/config/inputs', (req, res) => {
  try {
    if (fs.existsSync(inputConfigPath)) {
      const data = fs.readFileSync(inputConfigPath, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Error reading input config:', error);
    res.status(500).json({ error: 'Failed to read input configuration' });
  }
});

app.get('/api/config/outputs', (req, res) => {
  try {
    if (fs.existsSync(outputConfigPath)) {
      const data = fs.readFileSync(outputConfigPath, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Error reading output config:', error);
    res.status(500).json({ error: 'Failed to read output configuration' });
  }
});

app.get('/api/config/templates', (req, res) => {
  try {
    if (fs.existsSync(templatesConfigPath)) {
      const data = fs.readFileSync(templatesConfigPath, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error reading templates config:', error);
    res.status(500).json({ error: 'Failed to read templates configuration' });
  }
});

app.post('/api/config/inputs', (req, res) => {
  try {
    fs.writeFileSync(inputConfigPath, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true, message: 'Input configuration saved successfully' });
  } catch (error) {
    console.error('Error saving input config:', error);
    res.status(500).json({ error: 'Failed to save input configuration' });
  }
});

app.post('/api/config/outputs', (req, res) => {
  try {
    fs.writeFileSync(outputConfigPath, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true, message: 'Output configuration saved successfully' });
  } catch (error) {
    console.error('Error saving output config:', error);
    res.status(500).json({ error: 'Failed to save output configuration' });
  }
});

app.post('/api/config/templates', (req, res) => {
  try {
    fs.writeFileSync(templatesConfigPath, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true, message: 'Templates saved successfully' });
  } catch (error) {
    console.error('Error saving templates:', error);
    res.status(500).json({ error: 'Failed to save templates' });
  }
});

// CSV to Table conversion function
function parseCSVToTable(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(header => header.trim());
    
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(value => value.trim());
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        rows.push(row);
      }
    }
    
    return {
      headers,
      rows
    };
  } catch (error) {
    console.error('Error parsing CSV file:', error);
    return { error: 'Failed to parse CSV file' };
  }
}

// API endpoint to convert CSV to table
app.post('/api/convert-csv', upload.single('csv'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }
    
    const tableData = parseCSVToTable(req.file.path);
    
    if (tableData.error) {
      return res.status(500).json({ error: tableData.error });
    }
    
    return res.json({
      success: true,
      tableData
    });
  } catch (error) {
    console.error('Error converting CSV to table:', error);
    return res.status(500).json({ error: 'Server error processing CSV file' });
  }
});

// API routes
app.post('/api/generate-brd', upload.fields([
  { name: 'csv', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'doc', maxCount: 1 }
]), async (req, res) => {
  try {
    // Extract form data
    const { template, formData, businessUseCase, businessLogic, outputs } = req.body;
    
    if (!template || !businessLogic) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Get uploaded files
    const files = req.files || {};
    const fileMap = {};
    
    // Map file paths
    Object.entries(files).forEach(([type, fileArr]) => {
      if (fileArr && fileArr.length > 0) {
        fileMap[type] = fileArr[0].path;
      }
    });
    
    // Create data file for Python script
    const jsonData = {
      template,
      formData,
      businessUseCase,
      businessLogic,
      outputs,
      files: fileMap,
      apiKey: API_KEY
    };
    
    const jsonFilePath = path.join(req.sessionDir, 'data.json');
    await fs.writeFile(jsonFilePath, JSON.stringify(jsonData));
    
    // Generate output filename
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const outputFileName = `BRD_${timestamp}.pdf`;
    const outputFilePath = path.join(GENERATED_DIR, outputFileName);
    
    // Call Python script to generate BRD
    const options = {
      args: [jsonFilePath, outputFilePath]
    };
    
    PythonShell.run(PYTHON_SCRIPT_PATH, options)
      .then(() => {
        // Check if file was created
        if (!fs.existsSync(outputFilePath)) {
          throw new Error('Output file was not created by the script');
        }
        
        // Return success response
        res.json({
          success: true,
          fileName: outputFileName,
          downloadUrl: `/generated/${outputFileName}`,
          timestamp: new Date().toISOString()
        });
      })
      .catch(err => {
        console.error('Python script error:', err);
        res.status(500).json({
          success: false,
          message: `Failed to generate BRD: ${err.message}`
        });
      });
  } catch (error) {
    console.error('Error in generate-brd endpoint:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Function to create Python script
function createPythonScript() {
  const scriptContent = `#!/usr/bin/env python3
import sys
import json
import os
import pandas as pd
import base64
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
import requests
from PIL import Image
from io import BytesIO
import markdown
import re
from datetime import datetime

def generate_content_with_ai(prompt, api_key):
    """Generate content using AI with the provided API key."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "gpt-4-turbo-preview",
        "messages": [
            {"role": "system", "content": "You are a professional business document writer specializing in technical Business Requirements Documents."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 2000
    }
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        else:
            print(f"Error: {response.status_code}")
            print(response.text)
            return "An error occurred while generating content."
    except Exception as e:
        print(f"Exception: {e}")
        return "An error occurred while generating content."

def create_brd_document(data_file, output_file):
    """Create a BRD document from JSON data."""
    # Load data
    with open(data_file, 'r') as f:
        data = json.load(f)
    
    # Extract components
    template = json.loads(data['template'])
    form_data = json.loads(data['formData'])
    business_use_case = data['businessUseCase']
    business_logic = data['businessLogic']
    outputs = json.loads(data['outputs'])
    files = data.get('files', {})
    api_key = data.get('apiKey', '')
    
    # Create document
    doc = Document()
    
    # Document styles
    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(11)
    
    # Title
    title = doc.add_heading(f"Business Requirements Document: {template['templateName']}", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    # Date
    date_paragraph = doc.add_paragraph()
    date_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    date_paragraph.add_run(f"Generated on {datetime.now().strftime('%B %d, %Y')}").italic = True
    
    doc.add_paragraph()  # Spacer
    
    # Overview Section
    doc.add_heading("1. Overview", 1)
    
    table = doc.add_table(rows=1, cols=2)
    table.style = 'Table Grid'
    
    # Header row
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = 'Field'
    hdr_cells[1].text = 'Value'
    
    # Add data rows
    for input_field in template['overview']:
        key = input_field['key']
        label = input_field['label']
        value = form_data.get(key, '')
        
        # Handle different types of values
        if isinstance(value, list):
            value = ", ".join(value)
        
        row_cells = table.add_row().cells
        row_cells[0].text = label
        row_cells[1].text = str(value)
    
    doc.add_paragraph()  # Spacer
    
    # Technical Section
    doc.add_heading("2. Technical Information", 1)
    
    # Process uploaded files
    if 'csv' in files and os.path.exists(files['csv']):
        doc.add_heading("2.1 Data Table", 2)
        try:
            df = pd.read_csv(files['csv'])
            table = doc.add_table(rows=1, cols=len(df.columns))
            table.style = 'Table Grid'
            
            # Header row
            for i, column_name in enumerate(df.columns):
                table.cell(0, i).text = column_name
            
            # Add data rows
            for _, row in df.iterrows():
                row_cells = table.add_row().cells
                for i, value in enumerate(row):
                    row_cells[i].text = str(value)
        except Exception as e:
            doc.add_paragraph(f"Error processing CSV file: {e}")
    
    if 'image' in files and os.path.exists(files['image']):
        doc.add_heading("2.2 System Diagram", 2)
        try:
            doc.add_picture(files['image'], width=Inches(6.0))
            caption = doc.add_paragraph("Figure: System Diagram")
            caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
        except Exception as e:
            doc.add_paragraph(f"Error processing image file: {e}")
    
    if 'doc' in files and os.path.exists(files['doc']):
        doc.add_heading("2.3 Reference Document", 2)
        doc.add_paragraph(f"Reference document: {os.path.basename(files['doc'])}")
    
    doc.add_paragraph()  # Spacer
    
    # Business Use Case Section
    doc.add_heading("3. Business Use Case", 1)
    doc.add_paragraph(business_use_case)
    
    doc.add_paragraph()  # Spacer
    
    # Generate AI content for Business Logic
    doc.add_heading("4. Business Logic", 1)
    doc.add_paragraph(business_logic)
    
    doc.add_paragraph()  # Spacer
    
    # Output Sections
    doc.add_heading("5. Outputs", 1)
    
    for i, output in enumerate(outputs):
        section_title = output['name']
        doc.add_heading(f"5.{i+1} {section_title}", 2)
        
        # Generate content based on output types
        output_types = output['types']
        
        # Generate AI content
        if 'content' in output_types:
            prompt = f"""
            Based on the following information, generate professional content for the '{section_title}' section of a Business Requirements Document:
            
            Business Use Case:
            {business_use_case}
            
            Business Logic:
            {business_logic}
            
            Please provide well-structured, detailed content suitable for a professional BRD. Include appropriate subsections and formatting.
            """
            
            ai_content = generate_content_with_ai(prompt, api_key)
            
            # Convert markdown to rich text
            html_content = markdown.markdown(ai_content)
            
            # Basic HTML to document conversion
            paragraphs = re.split(r'<[/]?p>', html_content)
            for p in paragraphs:
                if p.strip():
                    # Handle headers using a simpler approach
                    for i in range(1, 7):
                        pattern = f'<h{i}>(.*?)</h{i}>'
                        match = re.search(pattern, p)
                        if match:
                            doc.add_heading(match.group(1), i + 2)
                            break
                    else:
                        # Handle lists
                        if '<ul>' in p or '<ol>' in p:
                            list_items = re.findall(r'<li>(.*?)</li>', p)
                            for item in list_items:
                                doc.add_paragraph(item.strip(), style='List Bullet')
                        else:
                            # Strip any remaining HTML tags
                            clean_text = re.sub(r'<.*?>', '', p)
                            if clean_text.strip():
                                doc.add_paragraph(clean_text.strip())
        
        # Table placeholder
        if 'table' in output_types:
            doc.add_paragraph("Table data would be included here based on requirements.")
        
        # Image placeholder
        if 'image' in output_types:
            doc.add_paragraph("Visual representation would be included here based on requirements.")
    
    # Save the document
    doc.save(output_file)
    return True

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python generate_brd.py <data_file> <output_file>")
        sys.exit(1)
    
    data_file = sys.argv[1]
    output_file = sys.argv[2]
    
    if create_brd_document(data_file, output_file):
        print(f"BRD document created successfully: {output_file}")
    else:
        print("Failed to create BRD document")
        sys.exit(1)
`;

  fs.writeFileSync(PYTHON_SCRIPT_PATH, scriptContent, { mode: 0o755 });
} 