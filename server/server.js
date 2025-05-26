require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
const BRDAIGenerator = require("./ai-generator");
const ConfluenceGenerator = require("./confluence");

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = "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";

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

const upload = multer({ storage: storage });

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.post("/api/convert-csv", upload.single("csv"), (req, res) => {
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
});

// Initialize AI Generator and Confluence Generator
const aiGenerator = new BRDAIGenerator();
const confluenceGenerator = new ConfluenceGenerator();

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
            await fs.writeFile(
                outputFilePath,
                JSON.stringify(result.brd, null, 2)
            );

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
        console.log(brdData);

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
    "/api/generate-brd",
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "doc", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            // Extract form data
            const {
                template,
                formData,
                businessUseCase,
                businessLogic,
                outputs,
                technicalData,
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

            // Parse technical data if it exists
            let parsedTechnicalData = {};
            if (technicalData) {
                try {
                    parsedTechnicalData = JSON.parse(technicalData);
                } catch (error) {
                    console.error("Error parsing technical data:", error);
                }
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

            console.log("=== Structured BRD Data ===");
            console.log(JSON.stringify(brdData, null, 2));

            // Call the generateBRD function
            const brdResult = await generateBRD(brdData);

            if (!brdResult.success) {
                return res.json(brdResult);
            }

            // Check for global Confluence configuration and publish if enabled
            let confluenceResult = null;
            try {
                const configPath = path.join(
                    __dirname,
                    "config",
                    "confluence.json"
                );
                if (fs.existsSync(configPath)) {
                    const confluenceConfig = JSON.parse(
                        fs.readFileSync(configPath, "utf8")
                    );

                    if (
                        confluenceConfig.enabled &&
                        confluenceConfig.baseUrl &&
                        confluenceConfig.username &&
                        confluenceConfig.apiToken
                    ) {
                        console.log(
                            "📄 Publishing to Confluence using global config..."
                        );

                        // Create temporary confluence generator with saved config
                        const tempConfluenceGenerator = new ConfluenceGenerator(
                            confluenceConfig
                        );
                        confluenceResult =
                            await tempConfluenceGenerator.createBRDPage(
                                brdResult.brdData
                            );
                    }
                }
            } catch (confluenceError) {
                console.error(
                    "Error with Confluence publishing:",
                    confluenceError
                );
                // Don't fail the entire request if Confluence fails
                confluenceResult = {
                    success: false,
                    error: confluenceError.message,
                };
            }

            // Return the result with optional Confluence data
            res.json({
                ...brdResult,
                confluence: confluenceResult,
            });
        } catch (error) {
            console.error("Error in generate-brd endpoint:", error);
            res.status(500).json({
                success: false,
                message: `Server error: ${error.message}`,
            });
        }
    }
);

// Generate BRD and optionally publish to Confluence
app.post(
    "/api/generate-brd-with-confluence",
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "doc", maxCount: 1 },
    ]),
    async (req, res) => {
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
            const confluenceOpts = JSON.parse(confluenceOptions);

            // Parse technical data if it exists
            let parsedTechnicalData = {};
            if (technicalData) {
                try {
                    parsedTechnicalData = JSON.parse(technicalData);
                } catch (error) {
                    console.error("Error parsing technical data:", error);
                }
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
            const brdResult = await generateBRD(brdData);

            if (!brdResult.success) {
                return res.json(brdResult);
            }

            // Publish to Confluence if requested
            let confluenceResult = null;
            if (shouldPublishToConfluence) {
                console.log("📄 Publishing to Confluence...");
                confluenceResult = await confluenceGenerator.createBRDPage(
                    brdResult.brdData,
                    confluenceOpts
                );
            }

            // Return combined result
            res.json({
                ...brdResult,
                confluence: confluenceResult,
            });
        } catch (error) {
            console.error(
                "Error in generate-brd-with-confluence endpoint:",
                error
            );
            res.status(500).json({
                success: false,
                message: `Server error: ${error.message}`,
            });
        }
    }
);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
