# AI-Powered BRD Generation Architecture

## 🏗️ **Architecture Overview**

The AI-powered BRD (Business Requirements Document) generation system uses a modular architecture that considers **Integration Mode** and **Direction** to generate contextually appropriate content using Google's Gemini 2.0 Flash LLM.

## 📊 **Integration Matrix**

### **Integration Modes:**
- **API-Based**: REST API integrations with endpoints, authentication, request/response patterns
- **Standard**: Standard templates (JSON, XML) with predefined scenarios and data validation
- **Custom Dev**: Custom development with CSV processing, data transformations, and business logic

### **Directions:**
- **Inbound**: Data flowing INTO Darwinbox from external systems
- **Outbound**: Data flowing OUT OF Darwinbox to external systems

### **Combination Matrix:**
| Mode | Direction | Focus Areas |
|------|-----------|-------------|
| API-Based + Inbound | Push data to Darwinbox APIs | API endpoints, authentication, data validation |
| API-Based + Outbound | Pull data from Darwinbox APIs | Response formats, error handling, rate limiting |
| Standard + Inbound | Standard file/template uploads | Template validation, scenarios, data mapping |
| Standard + Outbound | Standard file/template exports | File formats, scheduling, delivery mechanisms |
| Custom Dev + Inbound | Custom data processing | CSV uploads, transformations, business rules |
| Custom Dev + Outbound | Custom data extraction | Data filtering, custom formats, export logic |

## 🧠 **AI Generation Pipeline**

### **1. Context Builder**
```javascript
buildContext(brdData) {
    // Extracts and structures context from input data
    // - Integration mode and direction
    // - Business context and use cases
    // - Technical specifications
    // - Client/vendor information
}
```

### **2. Example Loader**
- Loads examples from `/examples` directory
- Maps examples to output types
- Provides contextual references for AI prompts

### **3. Content Generator**
- **Text Content**: Uses Google Gemini 2.0 Flash for professional text generation
- **Technical Diagrams**: Generates Graphviz DOT notation for system diagrams
- **Data Tables**: Creates structured tables with validation rules

### **4. Integration Orchestrator**
- Combines all generated outputs into comprehensive BRD
- Applies consistent formatting and styling
- Validates content quality and completeness

## 🎯 **AI Model Configuration**

The system uses **Google Gemini 2.0 Flash** for all AI-powered content generation:

- **Text Generation**: Creative, contextual content with professional formatting
- **Diagram Generation**: Technical architecture diagrams using Graphviz
- **Quality Assurance**: Consistent output quality with example-based training

### **Key Features of Gemini 2.0 Flash:**
- **Higher Quality**: Advanced understanding of business and technical contexts
- **Better Performance**: Faster response times and more reliable outputs
- **Enhanced Reasoning**: Superior handling of complex integration scenarios
- **Professional Tone**: Better alignment with enterprise documentation standards

## 🎯 **Context-Aware Prompting**

### **Base Prompt Structure:**
```
Generate [OUTPUT_TYPE] for a [MODE] [DIRECTION] integration between [CLIENT] and [VENDOR].

INTEGRATION CONTEXT:
- Mode: [API-Based/Standard/Custom Dev]
- Direction: [Inbound/Outbound]
- Business Use Case: [User-provided context]
- Business Logic: [Technical requirements]

EXAMPLES FOR REFERENCE:
[Relevant examples from the examples database]

SPECIFIC REQUIREMENTS:
[Mode and direction-specific requirements]
```

### **Adaptive Requirements:**
- **API-Based**: Focus on endpoints, authentication, response formats
- **Standard**: Emphasize templates, scenarios, validation rules
- **Custom Dev**: Highlight transformations, business logic, data processing

## 📁 **Examples Database Structure**

```
/examples/
├── purpose_justification_examples.md
├── integration_description_and_overview_examples.md
├── technical_content_or_specification_examples.md
├── dependencies_examples.md
├── assumptions_examples.md
└── error_handling_examples.md
```

Each example file contains:
- Multiple real-world examples (numbered #1, #2, etc.)
- Different integration patterns and scenarios
- Professional language and structure
- Context-specific content

## 🔄 **Generation Workflow**

1. **Input Processing**
   - Parse form data and extract key fields
   - Identify integration mode and direction
   - Build comprehensive context object

2. **Context Analysis**
   - Determine integration pattern (Mode_Direction)
   - Load relevant examples
   - Assess complexity and requirements

3. **AI Content Generation**
   - For each output in the configuration:
     - Select appropriate generator (text/diagram/table)
     - Build context-specific prompt
     - Call Google Gemini API with 2.0 Flash model
     - Post-process and validate output

4. **BRD Assembly**
   - Combine all generated outputs
   - Add metadata and context information
   - Include complexity assessment
   - Provide next steps recommendations

## ⚙️ **Configuration**

### **Environment Variables:**
```bash
GOOGLE_GEMINI_API_KEY=your_google_gemini_api_key_here
PORT=5000
UPLOAD_DIR=uploads
GENERATED_DIR=generated
```

### **AI Model Settings:**
- **Model**: `gemini-2.0-flash-exp` (Google's latest experimental model)
- **Temperature**: 0.2 (text content), 0.1 (diagrams)
- **Max Tokens**: 1500 (text), 1000 (diagrams)
- **Top P**: 0.9 (text generation)

## 📊 **Output Structure**

```json
{
  "metadata": {
    "generatedAt": "2024-01-01T00:00:00.000Z",
    "integrationPattern": "API-Based_Inbound",
    "mode": "API-Based",
    "direction": "Inbound",
    "client": "Client Name",
    "vendor": "Darwinbox"
  },
  "inputs": {
    "template": {...},
    "formData": {...},
    "businessUseCase": "...",
    "businessLogic": "...",
    "technicalData": {...}
  },
  "generatedContent": {
    "Purpose/Justification": "...",
    "Integration Description": "...",
    "Technical Specifications": "...",
    "Dependencies": "...",
    "Assumptions": "...",
    "Error Handling": "...",
    "Flow Diagram": {
      "type": "graphviz",
      "code": "digraph {...}",
      "format": "dot"
    }
  },
  "context": {...},
  "summary": {
    "totalOutputs": 7,
    "integrationComplexity": "Medium",
    "recommendedNextSteps": [...]
  }
}
```

## 🚀 **Benefits of This Architecture**

### **1. Context Awareness**
- Adapts content based on integration patterns
- Uses real-world examples for consistency
- Considers business and technical context

### **2. Modular Design**
- Separate generators for different content types
- Easy to extend with new output types
- Maintainable and testable code structure

### **3. Quality Assurance**
- Example-driven generation ensures consistency
- Fallback mechanisms for error handling
- Validation and post-processing of outputs

### **4. Scalability**
- Easy to add new integration modes
- Support for additional AI models
- Configurable parameters and settings

## 🛠️ **Usage**

1. **Setup Google Gemini API Key:**
   ```bash
   cp .env.example .env
   # Add your Google Gemini API key to .env
   # Get your API key from https://aistudio.google.com/app/apikey
   ```

2. **Start the Server:**
   ```bash
   npm start
   ```

3. **Generate BRD:**
   - Use the web interface to input integration details
   - Select outputs to generate
   - AI will create contextually appropriate content using Gemini 2.0 Flash
   - Download the generated BRD JSON

## 🔧 **Extending the System**

### **Adding New Output Types:**
1. Add examples to `/examples/new_output_type_examples.md`
2. Update `getSpecificRequirements()` method
3. Add output type handling in `generateOutput()`

### **Supporting New Integration Modes:**
1. Update context builder logic
2. Add mode-specific requirements
3. Update diagram generation logic
4. Add relevant examples

### **Integrating New AI Models:**
1. Add model configuration in ai-generator.js
2. Update API client initialization
3. Adjust prompt engineering as needed
4. Test with different model parameters

## 🚀 **Benefits of Gemini 2.0 Flash**

### **1. Enhanced Quality**
- Superior understanding of business contexts
- Better handling of technical specifications
- More consistent professional tone

### **2. Improved Performance**
- Faster response times compared to previous models
- More reliable content generation
- Better error handling and fallback mechanisms

### **3. Advanced Capabilities**
- Better reasoning for complex integration scenarios
- Enhanced understanding of enterprise documentation needs
- Superior handling of structured content generation 