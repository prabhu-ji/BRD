const fs = require("fs-extra");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const APIDocsManager = require("./api-docs-manager");

// Initialize Google Generative AI client - handle missing API key gracefully
let genAI = null;
let model = null;
try {
    if (process.env.GOOGLE_GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        console.log("✅ Google Gemini 2.0 Flash initialized successfully");
    } else {
        console.warn(
            "⚠️ GOOGLE_GEMINI_API_KEY not found - AI generation will be limited"
        );
    }
} catch (error) {
    console.warn(
        "⚠️ Google Gemini client initialization failed:",
        error.message
    );
}

class BRDAIGenerator {
    constructor() {
        this.examplesDir = path.join(__dirname, "examples");
        this.examples = {};
        this.apiDocsManager = new APIDocsManager();
        this.loadExamples();

        // Track generated outputs to prevent duplicates
        this.generatedOutputs = new Set();

        // Rate limiting and retry configuration
        this.rateLimiter = {
            requestQueue: [],
            isProcessing: false,
            lastRequestTime: 0,
            minInterval: 2000, // 2 seconds between requests
            maxRetries: 5,
            baseDelay: 1000, // 1 second base delay
            maxDelay: 30000, // 30 seconds max delay
            requestCount: 0,
            resetTime: Date.now() + 60000, // Reset counter every minute
            maxRequestsPerMinute: 15, // Conservative limit
        };
    }

    // Rate-limited API call with exponential backoff
    async makeRateLimitedAPICall(apiCall, context = {}) {
        return new Promise((resolve, reject) => {
            this.rateLimiter.requestQueue.push({
                apiCall,
                context,
                resolve,
                reject,
                attempts: 0,
                createdAt: Date.now(),
            });

            this.processQueue();
        });
    }

    // Process the request queue with rate limiting
    async processQueue() {
        if (
            this.rateLimiter.isProcessing ||
            this.rateLimiter.requestQueue.length === 0
        ) {
            return;
        }

        this.rateLimiter.isProcessing = true;

        while (this.rateLimiter.requestQueue.length > 0) {
            const request = this.rateLimiter.requestQueue.shift();

            try {
                // Check if we need to reset the request counter
                if (Date.now() > this.rateLimiter.resetTime) {
                    this.rateLimiter.requestCount = 0;
                    this.rateLimiter.resetTime = Date.now() + 60000;
                    console.log("🔄 Rate limiter: Request counter reset");
                }

                // Check rate limits
                if (
                    this.rateLimiter.requestCount >=
                    this.rateLimiter.maxRequestsPerMinute
                ) {
                    const waitTime = this.rateLimiter.resetTime - Date.now();
                    console.log(
                        `⏳ Rate limit reached. Waiting ${Math.ceil(
                            waitTime / 1000
                        )}s...`
                    );
                    await this.sleep(waitTime);
                    this.rateLimiter.requestCount = 0;
                    this.rateLimiter.resetTime = Date.now() + 60000;
                }

                // Ensure minimum interval between requests
                const timeSinceLastRequest =
                    Date.now() - this.rateLimiter.lastRequestTime;
                if (timeSinceLastRequest < this.rateLimiter.minInterval) {
                    const waitTime =
                        this.rateLimiter.minInterval - timeSinceLastRequest;
                    console.log(`⏳ Waiting ${waitTime}ms for rate limit...`);
                    await this.sleep(waitTime);
                }

                // Execute the API call with retry logic
                const result = await this.executeWithRetry(request);
                this.rateLimiter.lastRequestTime = Date.now();
                this.rateLimiter.requestCount++;

                request.resolve(result);
            } catch (error) {
                console.error(
                    `❌ API call failed after all retries:`,
                    error.message
                );
                request.reject(error);
            }
        }

        this.rateLimiter.isProcessing = false;
    }

    // Execute API call with exponential backoff retry
    async executeWithRetry(request) {
        const { apiCall, context, attempts } = request;
        request.attempts++;

        try {
            console.log(
                `🔄 API call attempt ${request.attempts}/${this.rateLimiter.maxRetries}`
            );
            const result = await apiCall();
            console.log(
                `✅ API call successful on attempt ${request.attempts}`
            );
            return result;
        } catch (error) {
            console.log(
                `⚠️ API call failed (attempt ${request.attempts}):`,
                error.message
            );

            // Check if it's a rate limit error (429) or quota exceeded
            const isRateLimitError =
                error.message.includes("429") ||
                error.message.includes("quota") ||
                error.message.includes("rate limit") ||
                error.message.includes("RATE_LIMIT_EXCEEDED");

            const isRetryableError =
                isRateLimitError ||
                error.message.includes("503") ||
                error.message.includes("502") ||
                error.message.includes("timeout");

            if (request.attempts >= this.rateLimiter.maxRetries) {
                throw new Error(
                    `Max retries (${this.rateLimiter.maxRetries}) exceeded. Last error: ${error.message}`
                );
            }

            if (!isRetryableError) {
                throw error; // Don't retry non-retryable errors
            }

            // Calculate exponential backoff delay
            let delay =
                this.rateLimiter.baseDelay * Math.pow(2, request.attempts - 1);

            // Add jitter to prevent thundering herd
            delay += Math.random() * 1000;

            // Cap the delay
            delay = Math.min(delay, this.rateLimiter.maxDelay);

            // For rate limit errors, use longer delays
            if (isRateLimitError) {
                delay = Math.max(delay, 10000); // Minimum 10 seconds for rate limit errors
                console.log(
                    `🚫 Rate limit detected. Waiting ${Math.ceil(
                        delay / 1000
                    )}s before retry...`
                );
            } else {
                console.log(`⏳ Retrying in ${Math.ceil(delay / 1000)}s...`);
            }

            await this.sleep(delay);
            return await this.executeWithRetry(request);
        }
    }

    // Sleep utility
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Load examples from the examples directory
    async loadExamples() {
        try {
            const exampleFiles = await fs.readdir(this.examplesDir);

            for (const file of exampleFiles) {
                if (file.endsWith(".md")) {
                    const filePath = path.join(this.examplesDir, file);
                    const content = await fs.readFile(filePath, "utf8");

                    // Extract the key from filename
                    const key = file.replace("_examples.md", "");
                    this.examples[key] = this.parseExamples(content);
                }
            }

            console.log(
                `📚 Loaded examples for: ${Object.keys(this.examples).join(
                    ", "
                )}`
            );
        } catch (error) {
            console.error("❌ Error loading examples:", error);
        }
    }

    // Parse examples from markdown content
    parseExamples(content) {
        const examples = [];
        const sections = content.split("#").filter((section) => section.trim());

        sections.forEach((section) => {
            const lines = section.trim().split("\n");
            if (lines.length > 1) {
                const id = lines[0].trim();
                const content = lines.slice(1).join("\n").trim();
                examples.push({ id, content });
            }
        });

        return examples;
    }

    // Main BRD generation orchestrator - RESTRUCTURED FOR CLEAN FORMAT
    async generateBRD(brdData) {
        console.log("🚀 Starting AI BRD Generation...");
        console.log(brdData);
        // Reset tracking
        this.generatedOutputs.clear();

        try {
            // Extract key context
            const context = await this.buildContext(brdData);
            console.log("📋 Context built:", {
                mode: context.mode,
                direction: context.direction,
                integrationPattern: context.integrationPattern,
                hasApiDocs: context.hasApiDocs,
            });

            // Generate the document title
            const documentTitle = this.generateDocumentTitle(brdData, context);

            // Create the details table
            const detailsTable = this.createDetailsTable(brdData, context);

            // Generate content sections - PREVENT DUPLICATES
            const generatedSections = {};
            const processedOutputNames = new Set();

            for (const output of brdData.outputs) {
                // Normalize output name to prevent duplicates
                const normalizedName = this.normalizeOutputName(output.name);

                if (processedOutputNames.has(normalizedName)) {
                    console.log(
                        `⚠️ Skipping duplicate: ${output.name} (already generated as ${normalizedName})`
                    );
                    continue;
                }

                console.log(`🔄 Generating: ${output.name}`);
                processedOutputNames.add(normalizedName);

                const generated = await this.generateOutput(
                    output.name,
                    output.types,
                    context,
                    brdData
                );

                generatedSections[output.name] = generated;
            }

            // Create final BRD in the clean format
            const finalBRD = {
                title: documentTitle,
                detailsTable: detailsTable,
                sections: generatedSections,
                metadata: {
                    generatedAt: new Date().toISOString(),
                    totalSections: Object.keys(generatedSections).length,
                },
            };

            console.log("✅ BRD Generation Complete");
            return {
                success: true,
                brd: finalBRD,
                context: context,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            console.error("❌ BRD Generation Error:", error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
            };
        }
    }

    // Generate document title - FIXED DATA HANDLING
    generateDocumentTitle(brdData, context) {
        const formData = brdData.formData || {};
        const client = this.extractFieldValue(
            formData,
            ["Client", "client"],
            "Client"
        );
        const vendor = this.extractFieldValue(
            formData,
            ["Vendor", "vendor"],
            ""
        );

        // Create a timestamp-based ID (like TS-0319)
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const docId = `TS-${month}${day}`;

        // Extract main business purpose for title
        const businessPurpose = brdData.businessUseCase || "Integration";
        const integrationName = businessPurpose.includes("Integration")
            ? businessPurpose
            : `${businessPurpose} Integration`;

        return `${docId} ${client} :: ${vendor} - ${integrationName} BRD`;
    }

    // ENHANCED: Extract field value with proper type handling - NO DEFAULTS
    extractFieldValue(formData, fieldNames, defaultValue = "") {
        // Support both string and array of field names
        const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];

        for (const name of names) {
            const value = formData[name];
            if (value !== undefined && value !== null && value !== "") {
                // Handle array values (like dropdown multi-select)
                if (Array.isArray(value)) {
                    return value.length > 0 ? value.join(", ") : defaultValue;
                }
                return value;
            }
        }
        return defaultValue;
    }

    // ENHANCED: Extract array values properly - NO DEFAULTS
    extractArrayValue(formData, fieldNames, defaultValue = []) {
        const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];

        for (const name of names) {
            const value = formData[name];
            if (value !== undefined && value !== null) {
                if (Array.isArray(value)) {
                    return value.filter((v) => v && v.trim()); // Remove empty strings
                } else if (typeof value === "string" && value.trim()) {
                    return [value.trim()];
                }
            }
        }
        return defaultValue;
    }

    // ENHANCED: Extract single value from potential array - NO DEFAULTS
    extractSingleValue(formData, fieldNames, defaultValue = "") {
        const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];

        for (const name of names) {
            const value = formData[name];
            if (value !== undefined && value !== null && value !== "") {
                if (Array.isArray(value)) {
                    return value[0] || defaultValue; // Take first value from array
                }
                return value;
            }
        }
        return defaultValue;
    }

    // Create details table matching the format in the image - MINIMAL DEFAULTS
    createDetailsTable(brdData, context) {
        const formData = brdData.formData || {};

        return {
            Client: this.extractFieldValue(formData, ["Client", "client"], ""),
            Vendor: this.extractFieldValue(formData, ["Vendor", "vendor"], ""),
            Version: this.extractFieldValue(
                formData,
                ["Version", "version"],
                ""
            ),
            "Doc Owner": this.extractFieldValue(
                formData,
                ["Doc Owner", "docOwner"],
                ""
            ),
            "Functional Lead": this.extractFieldValue(
                formData,
                ["Functional Lead", "functionalLead"],
                ""
            ),
            Status: this.extractSingleValue(formData, ["Status", "status"], ""),
            "Last updated by": this.extractFieldValue(
                formData,
                ["Last updated by", "Last Updated By", "lastUpdatedBy"],
                ""
            ),
            "Last date updated": this.extractFieldValue(
                formData,
                ["Last date updated", "Last Date Updated", "lastDateUpdated"],
                new Date()
                    .toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                    })
                    .replace(/\//g, "-")
            ), // Only generate date if missing
            "Client Approved By [Name, Designation]": this.extractFieldValue(
                formData,
                [
                    "Client Approved By [Name, Designation]",
                    "Client Approved By",
                    "clientApprovedBy",
                ],
                ""
            ),
            "Client Approved Date": this.extractFieldValue(
                formData,
                ["Client Approved Date", "clientApprovedDate"],
                ""
            ),
            "Mode of Integration": context.mode
                ? this.formatDropdownField(context.mode, [
                      "API-BASED",
                      "STANDARD",
                      "CUSTOM DEV",
                  ])
                : "",
            Modules:
                context.modules.length > 0 ? context.modules.join(", ") : "",
            Direction: context.direction
                ? this.formatDropdownField(context.direction.toUpperCase(), [
                      "INBOUND",
                      "OUTBOUND",
                      "BI-DIRECTION",
                  ])
                : "",
            Frequency: this.extractFieldValue(
                formData,
                ["Frequency", "frequency"],
                ""
            ),
            "Data Load": this.extractFieldValue(
                formData,
                ["Data Load", "dataLoad"],
                ""
            ),
            "Client email for error/success response": this.extractFieldValue(
                formData,
                [
                    "Client email for error/success response",
                    "Client Email",
                    "clientEmail",
                ],
                ""
            ),
        };
    }

    // Format dropdown fields to show available options
    formatDropdownField(selectedValue, availableOptions) {
        const options = availableOptions.map((option) =>
            option === selectedValue ? selectedValue : option
        );
        return `${selectedValue} [${availableOptions.join(" / ")}]`;
    }

    // Normalize output names to prevent duplicates
    normalizeOutputName(outputName) {
        return outputName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "");
    }

    // Build comprehensive context from input data with proper API docs integration - MINIMAL DEFAULTS
    async buildContext(brdData) {
        const formData = brdData.formData || {};

        // FIXED: Properly extract mode from array values
        const modeRaw = this.extractSingleValue(
            formData,
            ["Mode of Integration", "integrationMode", "mode"],
            ""
        );
        const mode = modeRaw
            ? String(modeRaw)
                  .replace("API - BASED", "API-Based")
                  .replace(/\s+/g, "-")
            : "";

        // FIXED: Properly extract direction
        const direction = this.extractSingleValue(
            formData,
            ["Direction", "direction"],
            ""
        );

        // FIXED: Handle empty vendor field gracefully
        const client = this.extractFieldValue(
            formData,
            ["Client", "client"],
            ""
        );
        const vendorRaw = this.extractFieldValue(
            formData,
            ["Vendor", "vendor"],
            ""
        );
        const vendor =
            vendorRaw && vendorRaw.trim() ? vendorRaw.trim().toLowerCase() : "";

        // FIXED: Properly extract modules array
        const moduleList = this.extractArrayValue(
            formData,
            ["Modules", "modules"],
            []
        );

        // Get API documentation context - ENHANCED INTEGRATION
        let apiContext = null;
        let hasApiDocs = false;
        try {
            // Only try to get API docs if we have a vendor
            if (vendor) {
                apiContext = await this.apiDocsManager.getAPIContext({
                    vendor: vendor,
                    modules: moduleList,
                    integrationMode: mode,
                    query: `${mode.toLowerCase()} ${direction.toLowerCase()}`,
                });

                hasApiDocs = !!(apiContext && apiContext.totalEndpoints > 0);

                if (hasApiDocs) {
                    console.log(
                        `📚 API Documentation loaded for ${vendor}: ${apiContext.totalEndpoints} endpoints available`
                    );
                } else {
                    console.log(`📚 No API documentation found for ${vendor}`);
                }
            }
        } catch (error) {
            console.error("❌ Error loading API documentation:", error.message);
        }

        return {
            // Core integration details
            mode: mode,
            direction: direction,
            integrationPattern: mode && direction ? `${mode}_${direction}` : "",

            // Business context
            businessUseCase: brdData.businessUseCase || "",
            businessLogic: brdData.businessLogic || "",

            // Client and vendor details
            client: client,
            vendor: vendor,
            modules: moduleList,

            // API Documentation context - ENHANCED
            apiContext: apiContext,
            hasApiDocs: hasApiDocs,
            apiSummary: hasApiDocs ? this.getApiSummary(apiContext) : null,

            // Integration specifics - FIXED EXTRACTION
            integrationApproach: this.extractFieldValue(
                formData,
                ["Integration Approach", "integrationApproach"],
                ""
            ),
            dataFormat: this.extractFieldValue(
                formData,
                ["Data Format", "dataFormat"],
                ""
            ),
            frequency: this.extractFieldValue(
                formData,
                ["Frequency", "frequency"],
                ""
            ),
            authentication: this.extractFieldValue(
                formData,
                ["Authentication", "authentication"],
                ""
            ),

            // Technical context
            technicalData: brdData.technicalData || {},
            hasApiSpecs: !!this.extractFieldValue(
                formData,
                ["API Endpoint", "apiEndpoint"],
                ""
            ),
            hasDataMapping: !!(
                brdData.technicalData &&
                Object.keys(brdData.technicalData).length > 0
            ),

            // Files context
            hasAttachments: !!(
                brdData.files && Object.keys(brdData.files).length > 0
            ),

            // Derived context - FIXED COMPARISONS
            isApiIntegration: mode.toLowerCase().includes("api"),
            isStandardIntegration: mode.toLowerCase().includes("standard"),
            isCustomDev: mode.toLowerCase().includes("custom"),
            isInbound: direction.toLowerCase() === "inbound",
            isOutbound: direction.toLowerCase() === "outbound",
        };
    }

    // Extract API summary for context
    getApiSummary(apiContext) {
        if (!apiContext || apiContext.totalEndpoints === 0) return null;

        return {
            totalEndpoints: apiContext.totalEndpoints,
            availableModules: apiContext.availableModules || [],
            sampleEndpoints: apiContext.topEndpoints
                ? apiContext.topEndpoints.slice(0, 3)
                : [],
            hasAuthentication: true,
            baseUrl: apiContext.baseUrl || null,
        };
    }

    // Generate specific output type - ENHANCED FOR LIST USAGE
    async generateOutput(outputName, outputTypes, context, brdData) {
        const outputKey = this.getOutputKey(outputName);
        const examples = this.examples[outputKey] || [];

        // Choose generator based on output type with better detection
        if (this.isDiagramOutput(outputName, outputTypes)) {
            return await this.generateDiagram(
                outputName,
                context,
                examples,
                brdData
            );
        } else if (this.isTableOutput(outputName, outputTypes)) {
            return await this.generateTable(
                outputName,
                context,
                examples,
                brdData
            );
        } else {
            return await this.generateTextContent(
                outputName,
                context,
                examples,
                brdData
            );
        }
    }

    // Better diagram detection
    isDiagramOutput(outputName, outputTypes) {
        const diagramKeywords = [
            "diagram",
            "flow",
            "chart",
            "architecture",
            "process",
        ];
        const nameCheck = diagramKeywords.some((keyword) =>
            outputName.toLowerCase().includes(keyword)
        );
        return outputTypes.includes("diagram") || nameCheck;
    }

    // Better table detection
    isTableOutput(outputName, outputTypes) {
        const tableKeywords = ["mapping", "table", "specification", "matrix"];
        const nameCheck = tableKeywords.some((keyword) =>
            outputName.toLowerCase().includes(keyword)
        );
        return outputTypes.includes("table") || nameCheck;
    }

    // Generate text-based content - ENHANCED TO USE MORE LISTS
    async generateTextContent(outputName, context, examples, brdData) {
        const prompt = this.buildEnhancedTextPrompt(
            outputName,
            context,
            examples,
            brdData
        );

        try {
            if (!model) {
                throw new Error(
                    "Google Gemini model not initialized - check GOOGLE_GEMINI_API_KEY"
                );
            }

            // Build the full prompt with system message
            const fullPrompt = `${this.getSystemPrompt()}\n\n${prompt}`;

            // Use rate-limited API call
            const result = await this.makeRateLimitedAPICall(
                async () => {
                    console.log(
                        `🤖 Generating text content for: ${outputName}`
                    );
                    return await model.generateContent({
                        contents: [
                            { role: "user", parts: [{ text: fullPrompt }] },
                        ],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 1500,
                            topP: 0.9,
                        },
                    });
                },
                { outputName, type: "text" }
            );

            let content = result.response.text() || "Content generation failed";

            // Post-process content to use lists and match style
            content = this.postProcessTextContent(
                content,
                outputName,
                examples
            );

            console.log(
                `✅ Text content generated for ${outputName} (${content.length} chars)`
            );

            return {
                type: "text",
                content: content,
            };
        } catch (error) {
            console.error(`❌ Error generating ${outputName}:`, error);

            // Provide fallback content for critical sections
            const fallbackContent = this.getFallbackContent(
                outputName,
                context,
                brdData
            );

            return {
                type: "text",
                content: fallbackContent,
                error: error.message,
                fallback: true,
            };
        }
    }

    // Provide fallback content when API fails - FIXED DATA HANDLING
    getFallbackContent(outputName, context, brdData) {
        const outputKey = this.getOutputKey(outputName);
        const formData = brdData.formData || {};
        const client = this.extractFieldValue(
            formData,
            ["Client", "client"],
            "Client System"
        );
        const vendor = this.extractFieldValue(
            formData,
            ["Vendor", "vendor"],
            ""
        );

        const fallbackTemplates = {
            purpose_justification: `
• This integration addresses the business requirement for ${context.direction.toLowerCase()} data synchronization between ${client} and ${vendor}
• The ${context.mode} approach ensures reliable and secure data exchange
• Implementation supports business process automation and data consistency requirements`,

            integration_description_and_overview: `
• ${context.mode} integration between ${client} and ${vendor} systems
• ${context.direction} data flow ensures proper information exchange
• Integration supports real-time data synchronization and processing
• Implementation follows enterprise security and compliance standards
• System architecture supports scalable and maintainable operations`,

            technical_content_or_specification: `
• Integration utilizes ${context.mode} methodology for data exchange
• Authentication and authorization mechanisms ensure secure access
• Data validation and transformation processes maintain data integrity
• Error handling and logging provide operational visibility
• Performance monitoring and alerting support system reliability`,

            dependencies: `
• ${client} system access and API credentials
• ${vendor} system integration endpoints and documentation
• Network connectivity and security configurations
• Data mapping and transformation specifications
• Testing and validation environment setup`,

            assumptions: `
• ${client} system provides reliable data access and availability
• ${vendor} system maintains consistent API functionality
• Network infrastructure supports required data transfer volumes
• Business processes accommodate integration timing requirements
• Support teams are available for troubleshooting and maintenance`,
        };

        return (
            fallbackTemplates[outputKey] ||
            `
• Integration requirement for ${outputName}
• ${context.mode} approach between ${client} and ${vendor}
• ${context.direction} data flow implementation
• Standard enterprise integration practices applied`
        );
    }

    // Enhanced system prompt emphasizing lists
    getSystemPrompt() {
        return `You are a Business Requirements Document (BRD) specialist with expertise in enterprise integrations, specifically working for Darwinbox's Integration team. 

CRITICAL FORMATTING REQUIREMENTS:
1. USE BULLET POINTS AND LISTS extensively - this is essential for readability
2. Structure content with clear bullet points for key information
3. Use numbered lists for sequential processes or steps
4. Use bullet points for requirements, features, or specifications
5. Keep paragraphs short and use lists to break down complex information

CONTENT REQUIREMENTS:
1. Generate content that matches the exact style and length of provided examples
2. Use professional, technical language appropriate for enterprise documentation
3. Focus on practical, implementation-ready requirements
4. Include specific technical details when API documentation is available
5. Keep content concise but comprehensive (similar to example length)
6. Use proper business terminology and avoid overly casual language

STYLE GUIDELINES:
- Write in third person
- Use clear, declarative statements with bullet points
- Include specific technical requirements in list format
- Reference actual systems and processes
- Maintain professional tone throughout
- ALWAYS prefer lists over long paragraphs`;
    }

    // Enhanced text prompt building - EMPHASIZING LISTS
    buildEnhancedTextPrompt(outputName, context, examples, brdData) {
        const exampleText = this.formatExamplesForPrompt(examples);
        const apiDocumentation = this.formatApiDocsForPrompt(context);
        const businessContext = this.formatBusinessContext(context, brdData);

        return `
Generate "${outputName}" for a ${context.mode} ${
            context.direction
        } integration between ${context.client} and ${context.vendor}.

${businessContext}

${apiDocumentation}

EXAMPLES TO FOLLOW (Match this style and length exactly):
${exampleText}

SPECIFIC REQUIREMENTS FOR ${outputName}:
${this.getEnhancedRequirements(outputName, context)}

CRITICAL FORMATTING INSTRUCTIONS:
1. USE BULLET POINTS AND LISTS extensively - this is mandatory
2. Break down information into clear, scannable bullet points
3. Use numbered lists for processes or sequential steps
4. Use bullet points for requirements, specifications, or features
5. Keep paragraphs very short (1-2 sentences max)
6. Structure content with headers and sub-bullet points when needed

BUSINESS CONTEXT:
- Integration Type: ${context.mode} ${context.direction}
- Client System: ${context.client}
- Target System: ${context.vendor}
- Modules: ${context.modules.join(", ") || "Core modules"}

Generate ONLY the content with proper list formatting - no explanations.`.trim();
    }

    // Format examples for better prompting
    formatExamplesForPrompt(examples) {
        if (!examples || examples.length === 0) {
            return "No specific examples available - follow general BRD best practices with professional, list-based formatting.";
        }

        return examples
            .slice(0, 3)
            .map((ex, index) => `EXAMPLE ${index + 1}:\n${ex.content}`)
            .join("\n\n");
    }

    // Format API docs for prompting
    formatApiDocsForPrompt(context) {
        if (!context.hasApiDocs || !context.apiSummary) {
            return "";
        }

        const summary = context.apiSummary;
        return `
API DOCUMENTATION CONTEXT:
- Total Available APIs: ${summary.totalEndpoints}
- Available Modules: ${summary.availableModules.join(", ")}
- Sample Endpoints: ${summary.sampleEndpoints
            .map((ep) => `${ep.method} ${ep.path}`)
            .join(", ")}
- Authentication: ${summary.hasAuthentication ? "Required" : "Not specified"}
${summary.baseUrl ? `- Base URL: ${summary.baseUrl}` : ""}`;
    }

    // Format business context
    formatBusinessContext(context, brdData) {
        return `
INTEGRATION CONTEXT:
- Pattern: ${context.integrationPattern}
- Business Use Case: ${
            context.businessUseCase || "Standard integration requirement"
        }
- Business Logic: ${
            context.businessLogic || "Standard data exchange and processing"
        }
- Modules: ${context.modules.join(", ") || "Core modules"}
- Data Direction: ${context.direction} (data flowing ${
            context.direction === "Inbound" ? "INTO" : "OUT OF"
        } ${context.vendor})`;
    }

    // Enhanced requirements based on output type - WITH LIST EMPHASIS
    getEnhancedRequirements(outputName, context) {
        const outputKey = this.getOutputKey(outputName);

        const requirements = {
            purpose_justification: `
- Write 2-3 bullet points maximum (match example length)
- State the business purpose clearly in bullet format
- Use bullet points to mention the integration approach (${context.mode})
- List the specific business needs
- Use professional, formal language in list format`,

            integration_description_and_overview: `
- Provide 4-6 bullet points describing the integration
- Use bullet points to explain the ${context.mode} approach technically
- List the ${context.direction} data flow specifics in bullet format
- Include implementation methodology as bullet points
- Reference specific systems and technologies in list format`,

            technical_content_or_specification: `
- Provide detailed technical specifications in bullet point format
- List specific API endpoints and methods if available
- Detail authentication and data formats as bullet points
- Specify error handling requirements in list format
- Include data transformation logic as bullet points
- Reference actual technical implementations in list format`,

            dependencies: `
- List specific technical dependencies for ${context.mode}
- Include system requirements and configurations as bullet points
- Mention API access and authentication needs in bullet format
- Specify data validation requirements as bullet points
- Keep each item concise and actionable in list format`,

            assumptions: `
- State clear, specific assumptions in bullet point format
- Include data quality and availability assumptions as bullet points
- Mention system uptime and performance expectations in list format
- Specify business process assumptions as bullet points
- Keep items realistic and verifiable in bullet format`,

            error_handling: `
- Define specific error scenarios for ${context.mode} ${context.direction} flow in bullet points
- Include retry mechanisms and fallback procedures as bullet points
- Specify error notification processes in list format
- Detail validation and rejection handling as bullet points
- Provide specific error codes and responses in list format`,
        };

        return (
            requirements[outputKey] ||
            `Generate appropriate content for ${outputName} using extensive bullet points and list formatting.`
        );
    }

    // Post-process content to use lists and match style
    postProcessTextContent(content, outputName, examples) {
        // Remove any unwanted formatting
        content = content.replace(/```[\s\S]*?```/g, ""); // Remove code blocks
        content = content.replace(/#{1,6}\s+/g, ""); // Remove markdown headers

        // Clean up multiple newlines
        content = content.replace(/\n{3,}/g, "\n\n");
        content = content.trim();

        // Ensure content uses lists if it doesn't already
        if (
            !content.includes("•") &&
            !content.includes("-") &&
            !content.includes("*")
        ) {
            // Convert sentences to bullet points
            const sentences = content.split(/[.!?]+/).filter((s) => s.trim());
            if (sentences.length > 1) {
                content = sentences
                    .map((sentence) => `• ${sentence.trim()}`)
                    .join("\n");
            }
        }

        // Ensure content length is similar to examples
        if (examples && examples.length > 0) {
            const avgExampleLength =
                examples.reduce((sum, ex) => sum + ex.content.length, 0) /
                examples.length;

            // If content is too long, truncate intelligently
            if (content.length > avgExampleLength * 1.5) {
                const lines = content.split("\n").filter((line) => line.trim());
                const targetLines = Math.ceil(avgExampleLength / 50); // Rough estimate
                content = lines.slice(0, targetLines).join("\n");
            }
        }

        return content;
    }

    // Generate Graphviz diagram code - FIXED TO ENFORCE GRAPHVIZ FORMAT
    async generateDiagram(outputName, context, examples, brdData) {
        const prompt = this.buildEnhancedDiagramPrompt(
            outputName,
            context,
            examples,
            brdData
        );

        try {
            if (!model) {
                throw new Error(
                    "Google Gemini model not initialized - check GOOGLE_GEMINI_API_KEY"
                );
            }

            // Build the full prompt with system message for diagrams
            const systemPrompt = `You are a technical architect specializing in Graphviz DOT notation diagrams. 

STRICT REQUIREMENTS:
1. ONLY generate Graphviz DOT notation - NO Mermaid, NO other formats
2. Always start with "digraph" or "graph"
3. Use proper DOT syntax with nodes and edges
4. Create professional system integration diagrams
5. Include proper node styling and layout directions
6. Return ONLY valid DOT code that can be rendered

FORBIDDEN:
- Mermaid syntax (graph TD, flowchart, etc.)
- Any other diagram formats
- Explanatory text outside the DOT code`;

            const fullPrompt = `${systemPrompt}\n\n${prompt}`;

            // Use rate-limited API call
            const result = await this.makeRateLimitedAPICall(
                async () => {
                    console.log(`🎨 Generating diagram for: ${outputName}`);
                    return await model.generateContent({
                        contents: [
                            { role: "user", parts: [{ text: fullPrompt }] },
                        ],
                        generationConfig: {
                            temperature: 0.1, // Very low for consistent diagram structure
                            maxOutputTokens: 1000,
                        },
                    });
                },
                { outputName, type: "diagram" }
            );

            let diagramCode = result.response.text() || "";

            // Post-process to ensure valid DOT notation
            diagramCode = this.postProcessDiagramCode(diagramCode, context);

            console.log(`✅ Diagram generated for ${outputName}`);

            return {
                type: "graphviz",
                code: diagramCode,
                format: "dot",
            };
        } catch (error) {
            console.error(
                `❌ Error generating diagram for ${outputName}:`,
                error
            );

            // Use enhanced default diagram as fallback
            const fallbackDiagram = this.getEnhancedDefaultDiagram(
                context,
                brdData
            );

            return {
                type: "graphviz",
                code: fallbackDiagram,
                format: "dot",
                error: error.message,
                fallback: true,
            };
        }
    }

    // Enhanced diagram prompt
    buildEnhancedDiagramPrompt(outputName, context, examples, brdData) {
        return `
Generate a Graphviz DOT diagram for "${outputName}" showing ${context.mode} ${
            context.direction
        } integration.

INTEGRATION DETAILS:
- Mode: ${context.mode}
- Direction: ${context.direction}
- Client: ${context.client}
- Vendor: ${context.vendor}
- Business Logic: ${context.businessLogic}

DIAGRAM REQUIREMENTS:
${this.getDiagramRequirements(outputName, context)}

CRITICAL: Generate ONLY Graphviz DOT notation syntax. Start with "digraph" and use proper DOT syntax.

Example structure:
digraph integration_flow {
    rankdir=LR;
    node [shape=box, style=rounded];
    // your nodes and edges here
}

Generate the complete DOT code now:`.trim();
    }

    // Post-process diagram code to ensure Graphviz format
    postProcessDiagramCode(diagramCode, context) {
        // Clean up the code
        diagramCode = diagramCode.trim();

        // Remove any markdown code block formatting
        diagramCode = diagramCode.replace(/```[\w]*\n?/g, "");
        diagramCode = diagramCode.replace(/```/g, "");

        // If it doesn't look like valid DOT notation, generate default
        if (
            !diagramCode.includes("digraph") &&
            !diagramCode.includes("graph")
        ) {
            console.log(
                "⚠️ Generated diagram not in DOT format, using default"
            );
            return this.getDefaultDiagram(context);
        }

        // Ensure proper structure
        if (!diagramCode.includes("{") || !diagramCode.includes("}")) {
            console.log("⚠️ Invalid DOT structure, using default");
            return this.getDefaultDiagram(context);
        }

        return diagramCode;
    }

    // Enhanced diagram requirements
    getDiagramRequirements(outputName, context) {
        const baseRequirements = `
- Show ${context.direction} data flow (${
            context.direction === "Inbound"
                ? "data coming INTO"
                : "data going OUT OF"
        } ${context.vendor})
- Include ${context.client} and ${context.vendor} systems
- Show integration points and data exchange
- Use appropriate node shapes and styling
- Include rankdir=LR for left-to-right layout`;

        if (context.isApiIntegration) {
            return (
                baseRequirements +
                `
- Show API endpoints and HTTP methods
- Include authentication components
- Display request/response flow patterns`
            );
        } else if (context.isStandardIntegration) {
            return (
                baseRequirements +
                `
- Show file/template processing steps
- Include validation and transformation nodes
- Display data exchange mechanisms`
            );
        } else {
            return (
                baseRequirements +
                `
- Show custom data processing steps
- Include transformation and validation nodes
- Display custom logic implementation`
            );
        }
    }

    // Get default diagram with proper Graphviz syntax
    getDefaultDiagram(context) {
        const client =
            context.client.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() ||
            "client";
        const vendor =
            context.vendor.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() ||
            "vendor";
        const mode = context.mode.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

        return `digraph ${mode}_integration {
    rankdir=LR;
    node [shape=box, style="rounded,filled", fontname="Arial"];
    edge [fontname="Arial"];
    
    ${client} [label="${context.client}\\nSystem", fillcolor=lightblue];
    api [label="Integration\\nLayer", fillcolor=lightgreen];
    auth [label="Authentication\\nService", fillcolor=yellow];
    ${vendor} [label="${context.vendor}\\nSystem", fillcolor=lightcoral];
    
    ${
        context.direction === "Inbound"
            ? `${client} -> api [label="Send Data"];
           api -> auth [label="Authenticate"];
           auth -> api [label="Validated"];
           api -> ${vendor} [label="Process"];
           ${vendor} -> api [label="Response"];
           api -> ${client} [label="Confirmation"];`
            : `${vendor} -> api [label="Request"];
           api -> auth [label="Authenticate"];
           auth -> api [label="Validated"];
           api -> ${client} [label="Fetch Data"];
           ${client} -> api [label="Data"];
           api -> ${vendor} [label="Response"];`
    }
}`;
    }

    // Enhanced default diagram with better context - FIXED DATA HANDLING
    getEnhancedDefaultDiagram(context, brdData) {
        const formData = brdData.formData || {};
        const clientLabel = this.extractFieldValue(
            formData,
            ["Client", "client"],
            "Client System"
        );
        const vendorLabel = this.extractFieldValue(
            formData,
            ["Vendor", "vendor"],
            ""
        );

        const client = clientLabel.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        const vendor = vendorLabel.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        const mode = context.mode.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

        return `digraph ${mode}_integration {
    rankdir=LR;
    node [shape=box, style="rounded,filled", fontname="Arial", fontsize=10];
    edge [fontname="Arial", fontsize=9];
    
    // Define nodes with proper styling
    ${client} [label="${clientLabel}\\nSystem", fillcolor=lightblue, width=1.5];
    api [label="Integration\\nAPI Layer", fillcolor=lightgreen, width=1.5];
    auth [label="Authentication\\n& Security", fillcolor=yellow, width=1.5];
    transform [label="Data\\nTransformation", fillcolor=orange, width=1.5];
    ${vendor} [label="${vendorLabel}\\nSystem", fillcolor=lightcoral, width=1.5];
    
    // Define the flow based on direction
    ${
        context.direction === "Inbound"
            ? `
    // Inbound flow: Client -> Darwinbox
    ${client} -> api [label="Send Request", color=blue];
    api -> auth [label="Authenticate", color=green];
    auth -> api [label="Validated", color=green];
    api -> transform [label="Process Data", color=purple];
    transform -> ${vendor} [label="Store/Update", color=red];
    ${vendor} -> transform [label="Confirmation", color=red];
    transform -> api [label="Response", color=purple];
    api -> ${client} [label="Success/Error", color=blue];`
            : `
    // Outbound flow: Darwinbox -> Client
    ${vendor} -> api [label="Data Request", color=red];
    api -> auth [label="Authenticate", color=green];
    auth -> api [label="Validated", color=green];
    api -> ${client} [label="Fetch Data", color=blue];
    ${client} -> api [label="Data Response", color=blue];
    api -> transform [label="Transform", color=purple];
    transform -> ${vendor} [label="Processed Data", color=red];`
    }
    
    // Add labels for clarity
    label="${context.mode} ${context.direction} Integration Flow";
    labelloc=t;
    fontsize=12;
    fontname="Arial Bold";
}`;
    }

    // FIXED: Section-specific content generation instead of generic table generation
    async generateTable(outputName, context, examples, brdData) {
        const outputKey = this.getOutputKey(outputName);

        // Route to specific generators based on section type
        if (outputKey.includes("api") && outputKey.includes("used")) {
            return await this.generateAPIsUsedContent(
                context,
                examples,
                brdData
            );
        } else if (
            outputKey.includes("data") &&
            outputKey.includes("mapping")
        ) {
            return this.generateDataMappingContent(context, brdData);
        } else if (
            outputKey.includes("technical") &&
            (outputKey.includes("design") ||
                outputKey.includes("specification"))
        ) {
            return await this.generateTechnicalSpecificationContent(
                context,
                examples,
                brdData
            );
        } else {
            // For any other table-like content, generate based on examples
            return await this.generateGenericTableContent(
                outputName,
                context,
                examples,
                brdData
            );
        }
    }

    // Generate APIs Used content - Simple description + API details
    async generateAPIsUsedContent(context, examples, brdData) {
        const outputKey = "apis_used";
        const sectionExamples = this.examples[outputKey] || [];

        if (sectionExamples.length === 0) {
            return {
                type: "text",
                content: "", // Empty if no examples available
            };
        }

        try {
            // Use existing text generation but with API-specific context
            const prompt = this.buildAPIsUsedPrompt(
                context,
                sectionExamples,
                brdData
            );

            if (!model) {
                return {
                    type: "text",
                    content: "", // No fallback content
                };
            }

            const result = await this.makeRateLimitedAPICall(
                async () => {
                    console.log(`🔌 Generating APIs Used content`);
                    return await model.generateContent({
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 1500,
                            topP: 0.9,
                        },
                    });
                },
                { outputName: "APIs Used", type: "api_content" }
            );

            let content = result.response.text() || "";
            content = this.postProcessTextContent(
                content,
                "APIs Used",
                sectionExamples
            );

            return {
                type: "text",
                content: content,
            };
        } catch (error) {
            console.error(`❌ Error generating APIs Used content:`, error);
            return {
                type: "text",
                content: "", // Empty on error, no fallback
                error: error.message,
            };
        }
    }

    // Generate Data Mapping content - Only if CSV data exists, else empty
    generateDataMappingContent(context, brdData) {
        // Check if we have CSV data
        if (
            brdData.technicalData &&
            brdData.technicalData.csv &&
            brdData.technicalData.csv.data
        ) {
            const csvData = brdData.technicalData.csv.data;

            // Return the actual CSV data as table
            return {
                type: "table",
                headers: csvData.headers || [],
                data: csvData.rows || [],
                // No validation rules or transformation notes - just the raw data
            };
        }

        // Return empty content if no CSV data
        return {
            type: "text",
            content: "", // Completely empty
        };
    }

    // Generate Technical Design Specifications content
    async generateTechnicalSpecificationContent(context, examples, brdData) {
        const outputKey = "technical_content_or_specification";
        const sectionExamples = this.examples[outputKey] || [];

        if (sectionExamples.length === 0) {
            return {
                type: "text",
                content: "", // Empty if no examples
            };
        }

        try {
            const prompt = this.buildTechnicalSpecificationPrompt(
                context,
                sectionExamples,
                brdData
            );

            if (!model) {
                return {
                    type: "text",
                    content: "", // No fallback
                };
            }

            const result = await this.makeRateLimitedAPICall(
                async () => {
                    console.log(
                        `🔧 Generating Technical Design Specifications`
                    );
                    return await model.generateContent({
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 1500,
                            topP: 0.9,
                        },
                    });
                },
                {
                    outputName: "Technical Design Specifications",
                    type: "technical_content",
                }
            );

            let content = result.response.text() || "";
            content = this.postProcessTextContent(
                content,
                "Technical Design Specifications",
                sectionExamples
            );

            return {
                type: "text",
                content: content,
            };
        } catch (error) {
            console.error(
                `❌ Error generating Technical Design Specifications:`,
                error
            );
            return {
                type: "text",
                content: "", // Empty on error
                error: error.message,
            };
        }
    }

    // Generate generic table content for other sections
    async generateGenericTableContent(outputName, context, examples, brdData) {
        // Use text generation instead of hardcoded table data
        return await this.generateTextContent(
            outputName,
            context,
            examples,
            brdData
        );
    }

    // Build APIs Used specific prompt
    buildAPIsUsedPrompt(context, examples, brdData) {
        const exampleText = this.formatExamplesForPrompt(examples);

        return `
Generate "APIs Used" section for a ${context.mode} ${
            context.direction
        } integration between ${context.client} and ${context.vendor}.

INTEGRATION CONTEXT:
- Type: ${context.mode} ${context.direction}
- Client: ${context.client}
- Vendor: ${context.vendor}
- Business Use Case: ${context.businessUseCase || ""}

EXAMPLES TO FOLLOW (Match this style and format exactly):
${exampleText}

REQUIREMENTS:
- Provide simple description of what the APIs do
- Include API details: endpoints, payload, response
- Use bullet points and structured format
- Focus on actual API implementation details
- NO generic content - be specific to this integration

Generate ONLY the APIs Used content - no explanations.`.trim();
    }

    // Build Technical Specification specific prompt
    buildTechnicalSpecificationPrompt(context, examples, brdData) {
        const exampleText = this.formatExamplesForPrompt(examples);

        return `
Generate "Technical Design Specifications" section for a ${context.mode} ${
            context.direction
        } integration between ${context.client} and ${context.vendor}.

INTEGRATION CONTEXT:
- Type: ${context.mode} ${context.direction}
- Client: ${context.client}
- Vendor: ${context.vendor}
- Business Logic: ${context.businessLogic || ""}

EXAMPLES TO FOLLOW (Match this style and format exactly):
${exampleText}

REQUIREMENTS:
- Focus on technical architecture and approach
- Include integration patterns, security, error handling
- NO data field mappings - this is about technical design
- Use bullet points and structured format
- Be specific to the integration methodology

Generate ONLY the Technical Design Specifications content - no explanations.`.trim();
    }

    // Get output key for examples mapping
    getOutputKey(outputName) {
        return outputName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "");
    }
}

module.exports = BRDAIGenerator;
