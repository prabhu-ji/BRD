const AIGenerator = require('./ai-generator');
const ConfluenceGenerator = require('./confluence');

async function testContentFlow() {
    console.log("🔍 Starting content flow debug test...");
    
    // Create AI generator instance
    const aiGenerator = new AIGenerator();
    
    // Create test BRD data with proper structure
    const testInput = {
        businessUseCase: "Employee Data Sync",
        integrationDirection: "bi-directional", 
        sourceSystem: "SAP",
        targetSystem: "DarwinBox",
        integrationMode: "real-time",
        formData: {
            Client: "Test Client",
            Vendor: "DarwinBox",
            "Business Use Case": "Employee Data Sync"
        },
        // Add the required outputs array
        outputs: [
            {
                name: "APIs Used",
                types: ["table"]
            },
            {
                name: "Data Mapping Table", 
                types: ["table"]
            },
            {
                name: "Technical Design Specifications",
                types: ["table"]
            }
        ]
    };
    
    console.log("📋 Test input:", testInput);
    
    // Generate BRD content
    console.log("\n🤖 Generating BRD content...");
    const brdResult = await aiGenerator.generateBRD(testInput);
    
    if (!brdResult.success) {
        console.error("❌ BRD generation failed:", brdResult.error);
        return;
    }
    
    const brdData = brdResult.brd;
    
    console.log("\n📊 Generated BRD structure:");
    console.log("Available sections:", Object.keys(brdData.sections || {}));
    
    // Check each section's structure
    for (const [sectionName, content] of Object.entries(brdData.sections || {})) {
        console.log(`\n🔍 Section: ${sectionName}`);
        console.log("Type:", typeof content);
        console.log("Has type field:", content && typeof content === 'object' && content.hasOwnProperty('type'));
        console.log("Type value:", content && typeof content === 'object' ? content.type : 'N/A');
        console.log("Has content field:", content && typeof content === 'object' && content.hasOwnProperty('content'));
        console.log("Content preview:", content && typeof content === 'object' ? 
            (typeof content.content === 'string' ? content.content.substring(0, 100) + '...' : content.content) : 
            (typeof content === 'string' ? content.substring(0, 100) + '...' : content));
    }
    
    // Test Confluence generator processing
    console.log("\n🏗️ Testing Confluence generator processing...");
    const confluenceGenerator = new ConfluenceGenerator({
        baseUrl: 'https://test.atlassian.net',
        username: 'test@example.com', 
        apiToken: 'test-token',
        spaceKey: 'TEST'
    });
    
    // Test content generation for each section
    for (const [sectionName, content] of Object.entries(brdData.sections || {})) {
        console.log(`\n🎯 Testing section: ${sectionName}`);
        
        // This will call our enhanced debugging functions
        const contentType = confluenceGenerator.detectContentType(sectionName, content);
        console.log(`Detected type: ${contentType}`);
        
        try {
            const generatedHtml = await confluenceGenerator.generateSmartContent(sectionName, content, contentType);
            console.log(`Generated HTML length: ${generatedHtml.length}`);
            console.log(`HTML preview: ${generatedHtml.substring(0, 200)}...`);
        } catch (error) {
            console.error(`Error generating content for ${sectionName}:`, error.message);
        }
    }
    
    console.log("\n✅ Content flow debug test completed");
}

// Run the test
testContentFlow().catch(console.error); 