require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
const { MongoClient } = require("mongodb");
const BRDAIGenerator = require("./ai-generator");
const ConfluenceGenerator = require("./confluence");

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = "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";

// MongoDB Configuration - Replace with your actual connection string
const MONGO_URI =
    process.env.MONGODB_URI || "mongodb://localhost:27017/brd_generator_db"; // Placeholder
let db; // Variable to hold the database connection

async function connectDB() {
    try {
        const client = new MongoClient(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        await client.connect();
        db = client.db(); // Specify the database name if not in URI, or remove .db() if URI has it.
        console.log("MongoDB connected successfully");
    } catch (err) {
        console.error("MongoDB connection error:", err);
        process.exit(1); // Exit process with failure
    }
}

const UPLOADS_DIR = path.join(__dirname, "uploads");
const GENERATED_DIR = path.join(__dirname, "generated");

fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(GENERATED_DIR);

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
    },
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
        fieldSize: 10 * 1024 * 1024, // 10MB per field (for technical data JSON)
        fields: 50, // Maximum number of non-file fields
        files: 10, // Maximum number of files
    },
});

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/generated", express.static(GENERATED_DIR));

const configDir = path.join(__dirname, "config");
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

const inputConfigPath = path.join(configDir, "configInput.json");
const outputConfigPath = path.join(configDir, "configOutput.json");
const templatesConfigPath = path.join(configDir, "templates.json");

// Initialize config files if they don't exist
if (!fs.existsSync(inputConfigPath)) {
    fs.writeFileSync(inputConfigPath, JSON.stringify({}), "utf8");
}

if (!fs.existsSync(outputConfigPath)) {
    fs.writeFileSync(outputConfigPath, JSON.stringify({}), "utf8");
}

if (!fs.existsSync(templatesConfigPath)) {
    fs.writeFileSync(templatesConfigPath, JSON.stringify([]), "utf8");
}

// Configuration API endpoints
app.get("/api/config/inputs", (req, res) => {
    try {
        if (fs.existsSync(inputConfigPath)) {
            const data = fs.readFileSync(inputConfigPath, "utf8");
            res.json(JSON.parse(data));
        } else {
            res.json({});
        }
    } catch (error) {
        console.error("Error reading input config:", error);
        res.status(500).json({ error: "Failed to read input configuration" });
    }
});

app.get("/api/config/outputs", (req, res) => {
    try {
        if (fs.existsSync(outputConfigPath)) {
            const data = fs.readFileSync(outputConfigPath, "utf8");
            res.json(JSON.parse(data));
        } else {
            res.json({});
        }
    } catch (error) {
        console.error("Error reading output config:", error);
        res.status(500).json({ error: "Failed to read output configuration" });
    }
});

app.get("/api/config/templates", (req, res) => {
    try {
        if (fs.existsSync(templatesConfigPath)) {
            const data = fs.readFileSync(templatesConfigPath, "utf8");
            res.json(JSON.parse(data));
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error("Error reading templates config:", error);
        res.status(500).json({
            error: "Failed to read templates configuration",
        });
    }
});

app.post("/api/config/inputs", (req, res) => {
    try {
        fs.writeFileSync(
            inputConfigPath,
            JSON.stringify(req.body, null, 2),
            "utf8"
        );
        res.json({
            success: true,
            message: "Input configuration saved successfully",
        });
    } catch (error) {
        console.error("Error saving input config:", error);
        res.status(500).json({ error: "Failed to save input configuration" });
    }
});

app.post("/api/config/outputs", (req, res) => {
    try {
        fs.writeFileSync(
            outputConfigPath,
            JSON.stringify(req.body, null, 2),
            "utf8"
        );
        res.json({
            success: true,
            message: "Output configuration saved successfully",
        });
    } catch (error) {
        console.error("Error saving output config:", error);
        res.status(500).json({ error: "Failed to save output configuration" });
    }
});

app.post("/api/config/templates", (req, res) => {
    try {
        fs.writeFileSync(
            templatesConfigPath,
            JSON.stringify(req.body, null, 2),
            "utf8"
        );
        res.json({ success: true, message: "Templates saved successfully" });
    } catch (error) {
        console.error("Error saving templates:", error);
        res.status(500).json({ error: "Failed to save templates" });
    }
});

// Test Confluence connection
app.get("/api/confluence/test", async (req, res) => {
    try {
        const result = await confluenceGenerator.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// API endpoint to save Confluence configuration
app.post("/api/config/confluence", (req, res) => {
    try {
        const confluenceConfig = req.body;

        // Validate required fields if enabled
        if (confluenceConfig.enabled) {
            if (
                !confluenceConfig.baseUrl ||
                !confluenceConfig.username ||
                !confluenceConfig.apiToken ||
                !confluenceConfig.spaceKey
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Missing required Confluence configuration fields",
                });
            }
        }

        // Save to file
        const configPath = path.join(__dirname, "config", "confluence.json");

        // Ensure config directory exists
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        fs.writeFileSync(configPath, JSON.stringify(confluenceConfig, null, 2));

        res.json({
            success: true,
            message: "Confluence configuration saved successfully",
        });
    } catch (error) {
        console.error("Error saving Confluence config:", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

// API endpoint to get Confluence configuration
app.get("/api/config/confluence", (req, res) => {
    try {
        const configPath = path.join(__dirname, "config", "confluence.json");

        if (fs.existsSync(configPath)) {
            const confluenceConfig = JSON.parse(
                fs.readFileSync(configPath, "utf8")
            );
            res.json(confluenceConfig);
        } else {
            res.json({
                enabled: false,
                baseUrl: "",
                username: "",
                apiToken: "",
                spaceKey: "BRD",
                pageId: "",
            });
        }
    } catch (error) {
        console.error("Error loading Confluence config:", error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

// API endpoint to test Confluence configuration
app.post("/api/confluence/test-config", async (req, res) => {
    try {
        const config = req.body;

        // Create a temporary confluence generator with the test config
        const tempConfluenceGenerator = new ConfluenceGenerator(config);
        const result = await tempConfluenceGenerator.testConnection();

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// CSV to Table conversion function
function parseCSVToTable(filePath) {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.trim().split("\n");
        const headers = lines[0].split(",").map((header) => header.trim());

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(",").map((value) => value.trim());
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
            rows,
        };
    } catch (error) {
        console.error("Error parsing CSV file:", error);
        return { error: "Failed to parse CSV file" };
    }
}

// API endpoint to convert CSV to table
app.post(
    "/api/convert-csv",
    (req, res, next) => {
        upload.single("csv")(req, res, (err) => {
            if (err) {
                console.error("Multer error:", err);
                if (err.code === "LIMIT_FIELD_VALUE") {
                    return res.status(413).json({
                        success: false,
                        error: "Request payload too large. Please reduce the size of your CSV file.",
                    });
                } else if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({
                        success: false,
                        error: "CSV file too large. Maximum file size is 50MB.",
                    });
                } else {
                    return res.status(400).json({
                        success: false,
                        error: `Upload error: ${err.message}`,
                    });
                }
            }
            next();
        });
    },
    (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: "No CSV file uploaded" });
            }

            const tableData = parseCSVToTable(req.file.path);

            if (tableData.error) {
                return res.status(500).json({ error: tableData.error });
            }

            return res.json({
                success: true,
                tableData,
            });
        } catch (error) {
            console.error("Error converting CSV to table:", error);
            return res
                .status(500)
                .json({ error: "Server error processing CSV file" });
        }
    }
);

// Initialize AI Generator and Confluence Generator
const aiGenerator = new BRDAIGenerator();

// Load Confluence configuration and initialize generator
let confluenceGenerator;
try {
    const configPath = path.join(__dirname, "config", "confluence.json");
    let confluenceConfig = {};

    if (fs.existsSync(configPath)) {
        confluenceConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
        console.log("📄 Loaded Confluence configuration from file");
    } else {
        console.log(
            "⚠️ No Confluence configuration file found, using environment variables"
        );
    }

    confluenceGenerator = new ConfluenceGenerator(confluenceConfig);
} catch (error) {
    console.error("❌ Error loading Confluence configuration:", error);
    confluenceGenerator = new ConfluenceGenerator(); // Fallback to empty config
}

// Generate BRD using AI
async function generateBRD(brdData) {
    try {
        console.log("🤖 Generating BRD with AI...");
        console.log("Input data structure:", {
            hasTemplate: !!brdData.template,
            hasFormData: !!brdData.formData,
            hasBusinessUseCase: !!brdData.businessUseCase,
            hasBusinessLogic: !!brdData.businessLogic,
            hasOutputs: !!brdData.outputs,
            hasTechnicalData: !!brdData.technicalData,
            hasFiles: !!(
                brdData.files && Object.keys(brdData.files).length > 0
            ),
        });

        // Use AI generator to create BRD
        const result = await aiGenerator.generateBRD(brdData);

        if (result.success) {
            // Generate output filename
            const timestamp = new Date()
                .toISOString()
                .replace(/[-:.]/g, "")
                .slice(0, 15);
            const outputFileName = `BRD_${timestamp}.json`;
            const outputFilePath = path.join(GENERATED_DIR, outputFileName);

            // Save the generated BRD as JSON
            // await fs.writeFile(
            //     outputFilePath,
            //     JSON.stringify(result.brd, null, 2)
            // );

            console.log("✅ AI BRD Generation Successful");
            return {
                success: true,
                fileName: outputFileName,
                downloadUrl: `/generated/${outputFileName}`,
                timestamp: new Date().toISOString(),
                message: "BRD document generated successfully using AI",
                brdData: result.brd,
                context: result.context,
            };
        } else {
            console.error("❌ AI BRD Generation Failed:", result.error);
            return {
                success: false,
                message: `AI generation failed: ${result.error}`,
                timestamp: new Date().toISOString(),
            };
        }
    } catch (error) {
        console.error("❌ Error in generateBRD function:", error);
        return {
            success: false,
            message: `BRD generation error: ${error.message}`,
            timestamp: new Date().toISOString(),
        };
    }
}

// Create Confluence page from generated BRD
app.post("/api/confluence/create", async (req, res) => {
    try {
        const { brdData, options = {} } = req.body;

        if (!brdData) {
            return res.status(400).json({
                success: false,
                message: "BRD data is required",
            });
        }

        const result = await confluenceGenerator.createBRDPage(
            brdData,
            options
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Update existing Confluence page
app.put("/api/confluence/update/:pageId", async (req, res) => {
    try {
        const { pageId } = req.params;
        const { brdData, options = {} } = req.body;

        if (!brdData) {
            return res.status(400).json({
                success: false,
                message: "BRD data is required",
            });
        }

        const result = await confluenceGenerator.updateSpecificBRDPage(
            pageId,
            brdData,
            options
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Search BRD pages in Confluence
app.get("/api/confluence/search", async (req, res) => {
    try {
        const { query = "", limit = 25 } = req.query;
        const result = await confluenceGenerator.searchBRDPages(
            query,
            parseInt(limit)
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Create BRD space in Confluence
app.post("/api/confluence/create-space", async (req, res) => {
    try {
        const result = await confluenceGenerator.createBRDSpace();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// API routes
app.post(
    "/api/generate-brd-with-confluence",
    (req, res, next) => {
        upload.fields([
            { name: "image", maxCount: 1 },
            { name: "doc", maxCount: 1 },
        ])(req, res, (err) => {
            if (err) {
                console.error("Multer error:", err);
                if (err.code === "LIMIT_FIELD_VALUE") {
                    return res.status(413).json({
                        success: false,
                        message:
                            "Request payload too large. Please reduce the size of your technical data or files.",
                        error: "Field value too long",
                    });
                } else if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({
                        success: false,
                        message: "File too large. Maximum file size is 50MB.",
                        error: "File size limit exceeded",
                    });
                } else if (err.code === "LIMIT_FILES") {
                    return res.status(413).json({
                        success: false,
                        message: "Too many files. Maximum 10 files allowed.",
                        error: "File count limit exceeded",
                    });
                } else {
                    return res.status(400).json({
                        success: false,
                        message: "Upload error occurred.",
                        error: err.message,
                    });
                }
            }
            next();
        });
    },
    async (req, res) => {
        const requestId = `REQ-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)}`;
        console.log(
            `🔍 [${requestId}] Starting /api/generate-brd-with-confluence request`
        );

        try {
            // Extract form data (same as existing endpoint)
            const {
                template,
                formData,
                businessUseCase,
                businessLogic,
                outputs,
                technicalData,
                publishToConfluence = "false",
                confluenceOptions = "{}",
            } = req.body;

            if (!template || !businessLogic) {
                return res.status(400).json({
                    success: false,
                    message: "Missing required fields",
                });
            }

            // Parse JSON strings with improved error handling
            let parsedTemplate;
            try {
                parsedTemplate = JSON.parse(template);
            } catch (error) {
                // If it's not valid JSON, treat it as a string template name
                parsedTemplate = template;
            }

            let parsedFormData;
            try {
                parsedFormData = JSON.parse(formData);
            } catch (error) {
                console.error("Error parsing formData:", error);
                return res.status(400).json({
                    success: false,
                    message: "Invalid formData JSON format",
                });
            }

            let parsedOutputs;
            try {
                parsedOutputs = JSON.parse(outputs);
            } catch (error) {
                console.error("Error parsing outputs:", error);
                return res.status(400).json({
                    success: false,
                    message: "Invalid outputs JSON format",
                });
            }

            const shouldPublishToConfluence = publishToConfluence === "true";

            // Fallback: Check saved Confluence configuration if client didn't request publishing
            let actuallyPublishToConfluence = shouldPublishToConfluence;
            if (!shouldPublishToConfluence) {
                try {
                    const configPath = path.join(
                        __dirname,
                        "config",
                        "confluence.json"
                    );
                    if (fs.existsSync(configPath)) {
                        const savedConfluenceConfig = JSON.parse(
                            fs.readFileSync(configPath, "utf8")
                        );
                        if (savedConfluenceConfig.enabled === true) {
                            actuallyPublishToConfluence = true;
                            console.log(
                                "📄 Using saved Confluence configuration to enable publishing..."
                            );
                        }
                    }
                } catch (error) {
                    console.error("Error reading Confluence config:", error);
                }
            }

            const confluenceOpts = JSON.parse(confluenceOptions);

            // Parse technical data if it exists
            let parsedTechnicalData = {};
            if (technicalData) {
                try {
                    console.log(
                        "🔍 Raw technical data received:",
                        technicalData
                    );
                    parsedTechnicalData = JSON.parse(technicalData);
                    console.log(
                        "✅ Parsed technical data:",
                        JSON.stringify(parsedTechnicalData, null, 2)
                    );
                } catch (error) {
                    console.error("Error parsing technical data:", error);
                }
            } else {
                console.log("⚠️ No technical data received in request");
            }

            // Transform outputs from object format to array format expected by AI generator
            let transformedOutputs = [];
            if (Array.isArray(parsedOutputs)) {
                // If it's already an array, use as is
                transformedOutputs = parsedOutputs;
            } else if (
                typeof parsedOutputs === "object" &&
                parsedOutputs !== null
            ) {
                // Transform object format to array format
                transformedOutputs = Object.entries(parsedOutputs).map(
                    ([name, types]) => ({
                        name: name,
                        types: Array.isArray(types) ? types : [types],
                    })
                );
            }

            console.log("Transformed outputs:", transformedOutputs);

            // Get uploaded files
            const files = req.files || {};
            const fileMap = {};

            // Map file paths for non-CSV files
            Object.entries(files).forEach(([type, fileArr]) => {
                if (fileArr && fileArr.length > 0) {
                    fileMap[type] = {
                        path: fileArr[0].path,
                        originalName: fileArr[0].originalname,
                        mimetype: fileArr[0].mimetype,
                        size: fileArr[0].size,
                    };
                }
            });

            // Create structured BRD data object
            const brdData = {
                template: parsedTemplate,
                formData: parsedFormData,
                businessUseCase,
                businessLogic,
                outputs: transformedOutputs,
                technicalData: parsedTechnicalData,
                files: fileMap,
                metadata: {
                    createdAt: new Date().toISOString(),
                    sessionId: uuidv4(),
                    apiKey: API_KEY,
                },
            };

            console.log("=== Generating BRD with Confluence Integration ===");

            // Call the generateBRD function
            console.log(
                `🔍 [${requestId}] Calling generateBRD with sessionId: ${brdData.metadata?.sessionId}`
            );
            const brdResult = await generateBRD(brdData);

            if (!brdResult.success) {
                return res.json(brdResult);
            }

            // Publish to Confluence if requested
            let confluenceResult = null;
            let diagramsArray = []; // Always extract diagrams for frontend

            if (actuallyPublishToConfluence) {
                console.log("📄 Publishing to Confluence...");
                confluenceResult = await confluenceGenerator.createBRDPage(
                    brdResult.brdData,
                    confluenceOpts
                );

                // Extract diagrams from Confluence result if available
                if (confluenceResult && confluenceResult.diagrams) {
                    diagramsArray = confluenceResult.diagrams;
                }

                // Save BRD metadata to MongoDB for History page if Confluence creation was successful
                if (confluenceResult && confluenceResult.success) {
                    try {
                        if (!db || !db.collection) {
                            console.error(
                                "MongoDB database or collection not initialized for saving BRD history."
                            );
                        } else {
                            const brdsCollection = db.collection("brds");
                            const historyEntry = {
                                name: confluenceResult.pageTitle,
                                createdAt:
                                    brdData.metadata?.createdAt || new Date(),
                                templateName: brdData.isAdHoc
                                    ? "Ad-Hoc"
                                    : brdData.template?.templateName || null,
                                isAdHoc: brdData.isAdHoc || false,
                                confluenceLink: confluenceResult.pageUrl,
                                pageId: confluenceResult.pageId,
                            };
                            await brdsCollection.insertOne(historyEntry);
                            console.log(
                                `📝 BRD history entry saved for: ${confluenceResult.pageTitle}`
                            );
                        }
                    } catch (dbError) {
                        console.error(
                            "Error saving BRD history to MongoDB:",
                            dbError
                        );
                        // Decide if this error should affect the overall response. For now, just log it.
                    }
                }
            } else {
                // Even when not publishing to Confluence, extract diagrams for frontend
                console.log(
                    "📊 Extracting diagrams for frontend (Confluence publishing disabled)..."
                );
                try {
                    // Extract diagrams directly from the generated BRD data
                    const sections =
                        brdResult.brdData.sections ||
                        brdResult.brdData.generatedContent ||
                        {};

                    console.log(
                        `🔍 Scanning ${
                            Object.keys(sections).length
                        } sections for diagrams...`
                    );
                    console.log(
                        `📋 Available sections:`,
                        Object.keys(sections)
                    );

                    for (const [sectionName, sectionContent] of Object.entries(
                        sections
                    )) {
                        console.log(
                            `🔍 Checking section "${sectionName}":`,
                            typeof sectionContent
                        );

                        // Log a preview of the content
                        if (typeof sectionContent === "string") {
                            const preview =
                                sectionContent.substring(0, 200) +
                                (sectionContent.length > 200 ? "..." : "");
                            console.log(`  Content preview: "${preview}"`);
                        } else if (typeof sectionContent === "object") {
                            console.log(
                                `  Object keys:`,
                                Object.keys(sectionContent || {})
                            );
                        }

                        // Check if this section contains diagram content
                        if (isDiagramContent(sectionContent)) {
                            console.log(
                                `🎨 Found diagram in section: ${sectionName}`
                            );

                            const diagramInfo = extractDiagramInfo(
                                sectionName,
                                sectionContent
                            );
                            if (diagramInfo && diagramInfo.mermaidCode) {
                                console.log(
                                    `✅ Successfully extracted diagram: ${diagramInfo.diagramName}`
                                );
                                diagramsArray.push({
                                    diagramId:
                                        diagramInfo.diagramId ||
                                        `diagram_${Date.now()}_${Math.random()
                                            .toString(36)
                                            .substring(2, 8)}`,
                                    diagramName:
                                        diagramInfo.diagramName || sectionName,
                                    mermaidCode: diagramInfo.mermaidCode,
                                    type: diagramInfo.type || "mermaid",
                                    timestamp: new Date().toISOString(),
                                });
                            } else {
                                console.log(
                                    `❌ Failed to extract diagram info from section: ${sectionName}`
                                );
                            }
                        } else {
                            console.log(`  → Not a diagram section`);
                        }
                    }

                    console.log(
                        `✅ Extracted ${diagramsArray.length} diagrams for frontend`
                    );
                } catch (extractError) {
                    console.error(
                        "❌ Error extracting diagrams for frontend:",
                        extractError.message
                    );
                    // Continue without diagrams rather than failing the entire request
                }
            }

            // Return combined result with diagrams always included
            const finalResult = {
                ...brdResult,
                confluence: confluenceResult,
                diagrams: diagramsArray, // Always include diagrams array for frontend
            };

            // Clean up uploaded files after successful generation
            await cleanupFiles(fileMap, brdData.metadata?.sessionId);

            res.json(finalResult);
        } catch (error) {
            console.error(
                "Error in generate-brd-with-confluence endpoint:",
                error
            );

            // Clean up files even on error
            try {
                const files = req.files || {};
                const fileMap = {};
                Object.entries(files).forEach(([type, fileArr]) => {
                    if (fileArr && fileArr.length > 0) {
                        fileMap[type] = {
                            path: fileArr[0].path,
                            originalName: fileArr[0].originalname,
                        };
                    }
                });
                await cleanupFiles(
                    fileMap,
                    req.body.sessionId || "error-cleanup"
                );
            } catch (cleanupError) {
                console.error("Error during error cleanup:", cleanupError);
            }

            res.status(500).json({
                success: false,
                message: `Server error: ${error.message}`,
            });
        }
    }
);

// Clean up uploaded files after generation
async function cleanupFiles(fileMap, sessionId) {
    console.log(`🧹 Cleaning up uploaded files for session: ${sessionId}`);
    const cleanupPromises = Object.values(fileMap).map(async (file) => {
        try {
            if (file.path && fs.existsSync(file.path)) {
                await fs.unlink(file.path);
                console.log(`✅ Deleted file: ${file.originalName}`);
            }
        } catch (error) {
            console.error(
                `❌ Error deleting file ${file.originalName}:`,
                error.message
            );
        }
    });

    await Promise.all(cleanupPromises);
}

// Helper function to detect if content contains a Mermaid diagram
function isDiagramContent(content) {
    if (typeof content === "string") {
        // Check for Mermaid diagram patterns
        return (
            content.includes("flowchart") ||
            content.includes("sequenceDiagram") ||
            content.includes("classDiagram") ||
            content.includes("graph TD") ||
            content.includes("graph LR") ||
            content.includes("stateDiagram") ||
            content.includes("erDiagram")
        );
    }

    if (typeof content === "object" && content !== null) {
        // Check if it's a diagram object
        if (content.type === "mermaid" || content.format === "mermaid") {
            return true;
        }

        // Check if the content/code property contains Mermaid
        const code = content.code || content.content || content.mermaid || "";
        return typeof code === "string" && isDiagramContent(code);
    }

    return false;
}

// Helper function to extract diagram information from content
function extractDiagramInfo(sectionName, content) {
    let mermaidCode = "";
    let diagramId = null;
    let type = "mermaid";

    if (typeof content === "string") {
        mermaidCode = content.trim();
    } else if (typeof content === "object" && content !== null) {
        mermaidCode = content.code || content.content || content.mermaid || "";
        diagramId = content.diagramId;
        type = content.type || content.format || "mermaid";
    }

    // Validate that we have actual Mermaid code
    if (!mermaidCode || typeof mermaidCode !== "string") {
        return null;
    }

    // Clean up the code (remove markdown blocks if present)
    mermaidCode = mermaidCode
        .replace(/```[\w]*\n?/g, "")
        .replace(/```/g, "")
        .trim();

    // Double check it's still valid Mermaid after cleanup
    if (!isDiagramContent(mermaidCode)) {
        return null;
    }

    return {
        diagramId:
            diagramId ||
            `${sectionName.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`,
        diagramName: sectionName,
        mermaidCode: mermaidCode,
        type: type,
    };
}

// Cleanup old session directories (older than 1 hour)
const cleanupOldSessions = async () => {
    try {
        if (!fs.existsSync(UPLOADS_DIR)) return;

        const sessions = await fs.readdir(UPLOADS_DIR);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;

        for (const session of sessions) {
            const sessionPath = path.join(UPLOADS_DIR, session);
            const stats = await fs.stat(sessionPath);

            if (stats.isDirectory() && stats.mtime.getTime() < oneHourAgo) {
                await fs.remove(sessionPath);
                console.log(`🧹 Cleaned up old session: ${session}`);
            }
        }
    } catch (error) {
        console.error("Error cleaning up old sessions:", error);
    }
};

// Run cleanup every 30 minutes
setInterval(cleanupOldSessions, 30 * 60 * 1000);

// NEW: BRD History Endpoint
app.get("/api/brds/history", async (req, res) => {
    //console.log("!!!!!!!!!!!!!! SERVER: /api/brds/history route handler reached !!!!!!!!!!!!!!"); // Added for debugging
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        if (!db) {
            // Check if db is initialized
            console.error(
                "MongoDB database not initialized when trying to access /api/brds/history."
            );
            return res.status(500).json({
                message: "Database not configured or connection failed.",
            });
        }
        const brdsCollection = db.collection("brds");

        const totalItems = await brdsCollection.countDocuments();
        const brds = await brdsCollection
            .find({})
            .sort({ createdAt: -1 }) // Sort by creation date, newest first
            .skip(skip)
            .limit(limit)
            .toArray();

        res.json({
            brds,
            totalItems,
            currentPage: page,
            totalPages: Math.ceil(totalItems / limit),
        });
    } catch (error) {
        console.error("Error fetching BRD history:", error);
        res.status(500).json({
            message: "Failed to fetch BRD history",
            error: error.message,
        });
    }
});

// Save uploaded template
// ... existing code ...

// Start server - modified to connect to DB first
async function startServer() {
    await connectDB(); // Connect to MongoDB
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer(); // Call startServer instead of app.listen directly
