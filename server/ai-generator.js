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
                // Build more specific query using business context
                const businessKeywords = [
                    brdData.businessUseCase,
                    brdData.businessLogic,
                    ...moduleList,
                    mode.toLowerCase(),
                    direction.toLowerCase(),
                ]
                    .filter(Boolean)
                    .join(" ");

                apiContext = await this.apiDocsManager.getAPIContext({
                    vendor: vendor,
                    modules: moduleList,
                    integrationMode: mode,
                    query:
                        businessKeywords ||
                        `${mode.toLowerCase()} ${direction.toLowerCase()}`,
                });

                // FIXED: Check the correct property for API docs availability
                hasApiDocs = !!(
                    apiContext &&
                    apiContext.hasDocumentation &&
                    apiContext.endpoints &&
                    apiContext.endpoints.length > 0
                );

                if (hasApiDocs) {
                    console.log(
                        `📚 API Documentation loaded for ${vendor}: ${apiContext.endpoints.length} endpoints available`
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

    // Extract API summary for context - FIXED TO MATCH ACTUAL API CONTEXT STRUCTURE
    getApiSummary(apiContext) {
        if (
            !apiContext ||
            !apiContext.hasDocumentation ||
            !apiContext.endpoints ||
            apiContext.endpoints.length === 0
        ) {
            return null;
        }

        // Extract available modules from the API context
        const availableModules = Object.keys(apiContext.moduleInfo || {});

        // Get sample endpoints (first 3-5 most relevant ones)
        const sampleEndpoints = apiContext.endpoints
            .slice(0, 5)
            .map((endpoint) => ({
                method: endpoint.method,
                path: endpoint.path,
                description: endpoint.description || "",
                module: endpoint.module || "",
            }));

        return {
            totalEndpoints: apiContext.endpoints.length,
            availableModules: availableModules,
            sampleEndpoints: sampleEndpoints,
            hasAuthentication: !!(
                apiContext.authentication && apiContext.authentication.type
            ),
            authType: apiContext.authentication?.type || null,
            moduleInfo: apiContext.moduleInfo || {},
            vendor: apiContext.vendor,
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
            outputName.includes(keyword)
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

    // Enhanced system prompt emphasizing context synthesis
    getSystemPrompt() {
        return `You are a Business Requirements Document (BRD) specialist with expertise in enterprise integrations, specifically working for Darwinbox's Integration team. 

CRITICAL FORMATTING REQUIREMENTS:
1. USE BULLET POINTS AND LISTS extensively - this is essential for readability
2. Structure content with clear bullet points for key information
3. Use numbered lists for sequential processes or steps
4. Use bullet points for requirements, features, or specifications
5. Keep paragraphs short and use lists to break down complex information

CONTENT SYNTHESIS REQUIREMENTS:
1. PRIORITIZE CONTEXT INTEGRATION: Synthesize ALL available context sources in this order:
   a) Specific API documentation details (when available) - use actual endpoints, methods, authentication
   b) Business use case and business logic - align technical details with business requirements
   c) Integration specifics (mode, direction, modules) - ensure technical approach matches integration type
   d) Examples - use for style and structure, but adapt content to actual context

2. CONTEXT-DRIVEN SPECIFICITY:
   - When API documentation is available: Reference specific endpoints, authentication methods, and data structures
   - When business context is provided: Align all technical details with the stated business use case and logic
   - When modules are specified: Focus on module-specific functionality and requirements
   - Always prefer actual context data over generic examples

3. SECTION-SPECIFIC SYNTHESIS:
   - APIs Used: Prioritize actual API endpoints and authentication from documentation
   - Technical Specifications: Base architecture on available APIs and business requirements
   - Dependencies/Assumptions: Reference specific systems, modules, and business processes
   - Purpose/Overview: Connect technical approach directly to business use case

CONTENT REQUIREMENTS:
1. Generate content that matches the exact style and length of provided examples
2. Use professional, technical language appropriate for enterprise documentation
3. Focus on practical, implementation-ready requirements derived from actual context
4. Include specific technical details when API documentation is available
5. Keep content concise but comprehensive (similar to example length)
6. Use proper business terminology and avoid overly casual language

STYLE GUIDELINES:
- Write in third person
- Use clear, declarative statements with bullet points
- Include specific technical requirements in list format
- Reference actual systems, APIs, and processes from provided context
- Maintain professional tone throughout
- ALWAYS prefer lists over long paragraphs
- Ensure every bullet point adds specific, actionable value`;
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

    // Format API docs for prompting - ENHANCED TO PROVIDE GRANULAR DETAILS
    formatApiDocsForPrompt(context) {
        if (!context.hasApiDocs || !context.apiSummary) {
            return "";
        }

        const summary = context.apiSummary;
        const apiContext = context.apiContext;

        let apiDetails = `
API DOCUMENTATION CONTEXT:
- Total Available APIs: ${summary.totalEndpoints}
- Available Modules: ${summary.availableModules.join(", ")}
- Authentication: ${summary.authType || "Required"}`;

        // Add specific endpoint details for better context
        if (summary.sampleEndpoints && summary.sampleEndpoints.length > 0) {
            apiDetails += `\n- Key Endpoints:`;
            summary.sampleEndpoints.forEach((endpoint) => {
                apiDetails += `\n  • ${endpoint.method} ${endpoint.path}`;
                if (endpoint.description) {
                    apiDetails += ` - ${endpoint.description}`;
                }
                if (endpoint.module) {
                    apiDetails += ` [${endpoint.module}]`;
                }
            });
        }

        // Add module-specific information if available
        if (summary.moduleInfo && Object.keys(summary.moduleInfo).length > 0) {
            apiDetails += `\n- Module Details:`;
            Object.entries(summary.moduleInfo).forEach(([module, info]) => {
                apiDetails += `\n  • ${module}: ${
                    info.description || "Available"
                }`;
                if (info.endpoints && info.endpoints.length > 0) {
                    apiDetails += ` (${info.endpoints.length} endpoints)`;
                }
            });
        }

        return apiDetails;
    }

    // NEW: Get detailed API context for specific sections
    getDetailedApiContext(context, sectionType) {
        if (!context.hasApiDocs || !context.apiContext) {
            return null;
        }

        const apiContext = context.apiContext;
        const relevantEndpoints = [];

        // Filter endpoints based on section type and business context
        if (sectionType === "apis_used") {
            // For APIs Used section, focus on endpoints relevant to the business use case
            const businessKeywords = [
                context.businessUseCase?.toLowerCase(),
                context.businessLogic?.toLowerCase(),
                ...context.modules.map((m) => m.toLowerCase()),
            ].filter(Boolean);

            apiContext.endpoints.forEach((endpoint) => {
                const searchText = [
                    endpoint.path,
                    endpoint.description,
                    endpoint.module,
                ]
                    .join(" ")
                    .toLowerCase();

                const isRelevant =
                    businessKeywords.some((keyword) =>
                        searchText.includes(keyword)
                    ) ||
                    (endpoint.module &&
                        context.modules.some((module) =>
                            endpoint.module
                                .toLowerCase()
                                .includes(module.toLowerCase())
                        ));

                if (isRelevant) {
                    relevantEndpoints.push(endpoint);
                }
            });
        } else if (sectionType === "technical_specification") {
            // For technical specs, focus on authentication, data models, and core endpoints
            relevantEndpoints.push(...apiContext.endpoints.slice(0, 3)); // Top 3 endpoints
        }

        return {
            endpoints: relevantEndpoints,
            authentication: apiContext.authentication,
            moduleInfo: apiContext.moduleInfo,
            examples: apiContext.examples || [],
            totalAvailable: apiContext.endpoints.length,
        };
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

    // Enhanced requirements based on output type - STRENGTHENED TO USE ALL CONTEXT
    getEnhancedRequirements(outputName, context) {
        const outputKey = this.getOutputKey(outputName);

        // Build context-aware guidance
        const contextGuidance = this.buildContextAwareGuidance(context);

        const requirements = {
            purpose_justification: `
- Write 2-3 bullet points maximum (match example length)
- State the business purpose clearly referencing: "${
                context.businessUseCase || "integration requirement"
            }"
- Use bullet points to mention the specific ${
                context.mode
            } approach and why it's chosen
- List the specific business needs that this integration addresses
- Reference the ${context.direction} data flow and its business impact
- Use professional, formal language in list format
${contextGuidance.apiGuidance}`,

            integration_description_and_overview: `
- Provide 4-6 bullet points describing the integration comprehensively
- Use bullet points to explain the ${
                context.mode
            } approach technically and its implementation
- List the ${context.direction} data flow specifics and business logic: "${
                context.businessLogic || "standard data processing"
            }"
- Include implementation methodology referencing available modules: ${
                context.modules.join(", ") || "core modules"
            }
- Reference specific systems (${context.client} and ${
                context.vendor
            }) and their roles
- Include business process integration details
${contextGuidance.apiGuidance}`,

            technical_content_or_specification: `
- Provide detailed technical specifications in bullet point format based on available context
- List specific technical approaches for ${context.mode} ${context.direction} integration
- Detail authentication, data formats, and security measures from available API information
- Specify error handling requirements and monitoring approaches
- Include data transformation logic and validation rules
- Reference actual technical implementations and architectural decisions
- Address scalability, performance, and reliability requirements
${contextGuidance.apiGuidance}`,

            dependencies: `
- List specific technical dependencies for ${context.mode} integration with ${
                context.vendor
            }
- Include system requirements and configurations for ${context.client} system
- Mention API access, authentication needs, and connectivity requirements
- Specify data validation requirements and business rule dependencies
- Include module-specific dependencies: ${
                context.modules.join(", ") || "core modules"
            }
- Reference business process dependencies from: "${
                context.businessLogic || "standard operations"
            }"
- Keep each item concise, actionable, and specific to this integration`,

            assumptions: `
- State clear, specific assumptions about ${context.client} and ${
                context.vendor
            } systems
- Include data quality and availability assumptions for ${
                context.direction
            } flow
- Mention system uptime and performance expectations for ${
                context.mode
            } integration
- Specify business process assumptions related to: "${
                context.businessUseCase || "integration requirements"
            }"
- Include technical assumptions about API availability and functionality
- Reference module-specific assumptions: ${
                context.modules.join(", ") || "core modules"
            }
- Keep items realistic, verifiable, and specific to this business context`,

            error_handling: `
- Define specific error scenarios for ${context.mode} ${context.direction} flow in bullet points
- Include retry mechanisms and fallback procedures for API interactions
- Specify error notification processes and escalation procedures
- Detail validation and rejection handling for business rules
- Provide specific error codes and responses based on integration type
- Reference business impact of errors and recovery procedures
- Include monitoring and alerting requirements for system health`,

            apis_used: `
- Focus on APIs that directly support: "${
                context.businessUseCase || "integration requirements"
            }"
- Include specific endpoint details, HTTP methods, and authentication
- Reference actual API modules: ${
                context.modules.join(", ") || "available modules"
            }
- Detail request/response structures and data formats
- Specify API usage patterns for ${context.direction} data flow
- Include error handling and rate limiting considerations for each API
- Use bullet points and structured format with technical specificity`,
        };

        return (
            requirements[outputKey] ||
            `Generate appropriate content for ${outputName} using extensive bullet points and list formatting.
${contextGuidance.general}
- Reference business context: "${
                context.businessUseCase || "integration requirement"
            }"
- Include technical details for ${context.mode} ${context.direction} integration
- Use specific system names: ${context.client} and ${context.vendor}
- Reference available modules: ${context.modules.join(", ") || "core modules"}`
        );
    }

    // NEW: Build context-aware guidance for requirements
    buildContextAwareGuidance(context) {
        let apiGuidance = "";
        let general = "";

        if (context.hasApiDocs && context.apiSummary) {
            apiGuidance = `
- Leverage available API documentation: ${
                context.apiSummary.totalEndpoints
            } endpoints
- Reference specific authentication method: ${
                context.apiSummary.authType || "standard"
            }
- Include module-specific API details: ${context.apiSummary.availableModules.join(
                ", "
            )}`;
        } else {
            apiGuidance = `
- Generate realistic technical details based on ${context.mode} integration patterns
- Include standard authentication and security measures for enterprise integrations`;
        }

        if (context.businessUseCase) {
            general += `\n- Align all content with business use case: "${context.businessUseCase}"`;
        }

        if (context.businessLogic) {
            general += `\n- Reference business logic requirements: "${context.businessLogic}"`;
        }

        return { apiGuidance, general };
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

    // Enhanced diagram prompt - IMPROVED WITH BUSINESS CONTEXT AND API DETAILS
    buildEnhancedDiagramPrompt(outputName, context, examples, brdData) {
        // Extract business-specific details for diagram labeling
        const businessContext = this.extractBusinessContextForDiagram(
            context,
            brdData
        );
        const apiDetails = this.extractApiDetailsForDiagram(context);

        return `
Generate a Graphviz DOT diagram for "${outputName}" showing ${context.mode} ${
            context.direction
        } integration.

INTEGRATION DETAILS:
- Mode: ${context.mode}
- Direction: ${context.direction}
- Client: ${context.client}
- Vendor: ${context.vendor}
- Business Use Case: ${context.businessUseCase || "Standard integration"}
- Business Logic: ${context.businessLogic || "Standard data processing"}
- Modules: ${context.modules.join(", ") || "Core modules"}

${businessContext}

${apiDetails}

DIAGRAM REQUIREMENTS:
${this.getDiagramRequirements(outputName, context)}

BUSINESS-SPECIFIC LABELING INSTRUCTIONS:
- Use business use case "${
            context.businessUseCase || "integration"
        }" to label key processes
- Include specific business logic steps: "${
            context.businessLogic || "data processing"
        }"
- Reference actual modules in node labels: ${
            context.modules.join(", ") || "core modules"
        }
- Show data flow that supports the business requirement
- Use meaningful business terminology in edge labels

CRITICAL: Generate ONLY Graphviz DOT notation syntax. Start with "digraph" and use proper DOT syntax.

Example structure:
digraph integration_flow {
    rankdir=LR;
    node [shape=box, style=rounded];
    // your nodes and edges here with business-specific labels
}

Generate the complete DOT code now:`.trim();
    }

    // NEW: Extract business context for diagram labeling
    extractBusinessContextForDiagram(context, brdData) {
        let businessDetails = "BUSINESS CONTEXT FOR DIAGRAM:";

        if (context.businessUseCase) {
            businessDetails += `\n- Primary Business Purpose: ${context.businessUseCase}`;
            businessDetails += `\n- Label key nodes with business purpose (e.g., "${context.businessUseCase} Processing")`;
        }

        if (context.businessLogic) {
            businessDetails += `\n- Business Logic Flow: ${context.businessLogic}`;
            businessDetails += `\n- Include business logic steps as intermediate nodes`;
        }

        if (context.modules && context.modules.length > 0) {
            businessDetails += `\n- Affected Modules: ${context.modules.join(
                ", "
            )}`;
            businessDetails += `\n- Show module-specific processing nodes (e.g., "${context.modules[0]} Module")`;
        }

        return businessDetails;
    }

    // NEW: Extract API details for diagram labeling
    extractApiDetailsForDiagram(context) {
        if (!context.hasApiDocs || !context.apiSummary) {
            return `
API CONTEXT FOR DIAGRAM:
- No specific API documentation available
- Use generic API integration patterns
- Include standard authentication and data exchange nodes`;
        }

        const apiSummary = context.apiSummary;
        let apiDetails = `
API CONTEXT FOR DIAGRAM:
- Available APIs: ${apiSummary.totalEndpoints} endpoints
- Authentication: ${apiSummary.authType || "Standard"}
- Modules: ${apiSummary.availableModules.join(", ")}`;

        if (
            apiSummary.sampleEndpoints &&
            apiSummary.sampleEndpoints.length > 0
        ) {
            apiDetails += `\n- Key Endpoints to Reference:`;
            apiSummary.sampleEndpoints.slice(0, 3).forEach((endpoint) => {
                apiDetails += `\n  • ${endpoint.method} ${endpoint.path}`;
                if (endpoint.description) {
                    apiDetails += ` (${endpoint.description})`;
                }
            });
            apiDetails += `\n- Use specific endpoint names in diagram nodes when relevant`;
        }

        apiDetails += `\n- Include "${
            apiSummary.authType || "API"
        } Authentication" node`;
        apiDetails += `\n- Show API-specific data processing flows`;

        return apiDetails;
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

    // Enhanced default diagram with better context - IMPROVED WITH BUSINESS KEYWORDS
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

        // Extract business context for more meaningful labels
        const businessUseCase = context.businessUseCase || "Integration";
        const businessLogic = context.businessLogic || "Data Processing";
        const primaryModule =
            context.modules.length > 0 ? context.modules[0] : "Core";

        // Determine authentication type from API context or use default
        const authType = context.apiSummary?.authType || "Bearer Token";

        // Create business-specific node labels
        const integrationLabel = businessUseCase.includes("Integration")
            ? businessUseCase
            : `${businessUseCase} Integration`;
        const processingLabel = businessLogic.includes("Processing")
            ? businessLogic
            : `${businessLogic} Processing`;

        return `digraph ${mode}_integration {
    rankdir=LR;
    node [shape=box, style="rounded,filled", fontname="Arial", fontsize=10];
    edge [fontname="Arial", fontsize=9];
    
    // Define nodes with business-specific styling and labels
    ${client} [label="${clientLabel}\\nSystem", fillcolor=lightblue, width=1.5];
    api [label="${integrationLabel}\\nAPI Layer", fillcolor=lightgreen, width=1.5];
    auth [label="${authType}\\nAuthentication", fillcolor=yellow, width=1.5];
    transform [label="${processingLabel}\\n& Validation", fillcolor=orange, width=1.5];
    module [label="${primaryModule}\\nModule", fillcolor=lightgray, width=1.5];
    ${vendor} [label="${vendorLabel}\\nSystem", fillcolor=lightcoral, width=1.5];
    
    // Define the flow based on direction with business-specific labels
    ${
        context.direction === "Inbound"
            ? `
    // Inbound flow: ${clientLabel} -> ${vendorLabel}
    ${client} -> api [label="${businessUseCase}\\nRequest", color=blue];
    api -> auth [label="Authenticate\\n& Authorize", color=green];
    auth -> api [label="Access\\nGranted", color=green];
    api -> transform [label="${businessLogic}\\nExecution", color=purple];
    transform -> module [label="${primaryModule}\\nUpdate", color=orange];
    module -> transform [label="Processing\\nComplete", color=orange];
    transform -> api [label="Business\\nResponse", color=purple];
    api -> ${client} [label="Success/Error\\nNotification", color=blue];`
            : `
    // Outbound flow: ${vendorLabel} -> ${clientLabel}
    ${vendor} -> api [label="${businessUseCase}\\nTrigger", color=red];
    api -> auth [label="Authenticate\\n& Authorize", color=green];
    auth -> api [label="Access\\nGranted", color=green];
    api -> module [label="${primaryModule}\\nData Request", color=orange];
    module -> transform [label="Data\\nRetrieval", color=orange];
    transform -> api [label="${businessLogic}\\nProcessing", color=purple];
    api -> ${client} [label="Processed\\nData", color=blue];
    ${client} -> api [label="Delivery\\nConfirmation", color=blue];`
    }
    
    // Add business context labels for clarity
    label="${integrationLabel}\\n${context.mode} ${context.direction} Flow";
    labelloc=t;
    fontsize=12;
    fontname="Arial Bold";
    
    // Add legend for business context
    subgraph cluster_legend {
        label="Business Context";
        style=dashed;
        fontsize=10;
        legend1 [label="Use Case: ${businessUseCase}", shape=plaintext, fontsize=8];
        legend2 [label="Logic: ${businessLogic}", shape=plaintext, fontsize=8];
        legend3 [label="Module: ${primaryModule}", shape=plaintext, fontsize=8];
    }
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

    // Build APIs Used specific prompt - ENHANCED WITH DETAILED API CONTEXT
    buildAPIsUsedPrompt(context, examples, brdData) {
        const exampleText = this.formatExamplesForPrompt(examples);

        // Get detailed API context for this section
        const detailedApiContext = this.getDetailedApiContext(
            context,
            "apis_used"
        );

        let apiSpecificGuidance = "";
        if (detailedApiContext && detailedApiContext.endpoints.length > 0) {
            apiSpecificGuidance = `
SPECIFIC API DETAILS TO USE:
${detailedApiContext.endpoints
    .map((endpoint) => {
        let endpointDetail = `• ${endpoint.method} ${endpoint.path}`;
        if (endpoint.description) {
            endpointDetail += `\n  Description: ${endpoint.description}`;
        }
        if (endpoint.module) {
            endpointDetail += `\n  Module: ${endpoint.module}`;
        }
        if (endpoint.parameters && endpoint.parameters.length > 0) {
            endpointDetail += `\n  Key Parameters: ${endpoint.parameters
                .slice(0, 3)
                .map((p) => p.name)
                .join(", ")}`;
        }
        if (endpoint.body && endpoint.body.example) {
            endpointDetail += `\n  Has Request Body: Yes`;
        }
        return endpointDetail;
    })
    .join("\n\n")}

AUTHENTICATION DETAILS:
${
    detailedApiContext.authentication?.type
        ? `- Type: ${detailedApiContext.authentication.type}`
        : "- Standard API authentication required"
}
${
    detailedApiContext.authentication?.description
        ? `- Details: ${detailedApiContext.authentication.description}`
        : ""
}

INSTRUCTIONS FOR API USAGE:
- Use the SPECIFIC endpoints listed above that are relevant to "${
                context.businessUseCase || "this integration"
            }"
- Include actual endpoint paths, HTTP methods, and key parameters
- Reference the authentication method specified above
- Mention request/response data structures if available
- Focus on APIs that support the ${context.direction.toLowerCase()} data flow
- Be specific about which APIs handle which business functions`;
        } else if (context.hasApiDocs) {
            apiSpecificGuidance = `
API CONTEXT AVAILABLE:
- Total APIs available: ${context.apiSummary?.totalEndpoints || 0}
- Modules: ${
                context.apiSummary?.availableModules?.join(", ") ||
                "Not specified"
            }
- Authentication: ${context.apiSummary?.authType || "Required"}

INSTRUCTIONS:
- Reference the available API modules and authentication method
- Provide realistic API endpoint examples based on the integration type
- Focus on APIs that would support "${
                context.businessUseCase || "this integration"
            }"`;
        } else {
            apiSpecificGuidance = `
NO SPECIFIC API DOCUMENTATION AVAILABLE:
- Generate realistic API examples based on the integration requirements
- Focus on standard ${
                context.mode
            } patterns for ${context.direction.toLowerCase()} data flow
- Include typical authentication and data exchange patterns`;
        }

        return `
Generate "APIs Used" section for a ${context.mode} ${
            context.direction
        } integration between ${context.client} and ${context.vendor}.

INTEGRATION CONTEXT:
- Type: ${context.mode} ${context.direction}
- Client: ${context.client}
- Vendor: ${context.vendor}
- Business Use Case: ${context.businessUseCase || ""}
- Modules: ${context.modules.join(", ") || "Core modules"}

${apiSpecificGuidance}

EXAMPLES TO FOLLOW (Match this style and format exactly):
${exampleText}

CRITICAL REQUIREMENTS:
- Use SPECIFIC API details provided above when available
- Include actual endpoint paths, methods, and parameters
- Reference the specific authentication method mentioned
- Focus on APIs that directly support the business use case: "${
            context.businessUseCase || "data integration"
        }"
- Use bullet points and structured format matching the examples
- NO generic content - be specific to this integration and available APIs
- If no specific APIs are available, create realistic examples based on the integration pattern

Generate ONLY the APIs Used content - no explanations.`.trim();
    }

    // Build Technical Specification specific prompt - SIMPLIFIED FOR CONCISE OUTPUT
    buildTechnicalSpecificationPrompt(context, examples, brdData) {
        const exampleText = this.formatExamplesForPrompt(examples);

        // Get simplified API context for technical specifications
        const detailedApiContext = this.getDetailedApiContext(
            context,
            "technical_specification"
        );

        let technicalGuidance = "";
        if (detailedApiContext && detailedApiContext.endpoints.length > 0) {
            const primaryEndpoints = detailedApiContext.endpoints.slice(0, 2);
            technicalGuidance = `
AVAILABLE API CONTEXT:
- Key APIs: ${primaryEndpoints
                .map((ep) => `${ep.method} ${ep.path}`)
                .join(", ")}
- Authentication: ${
                detailedApiContext.authentication?.type ||
                "Standard API authentication"
            }
- Total endpoints available: ${detailedApiContext.totalAvailable}

TECHNICAL GUIDANCE:
- Focus on high-level architecture and data flow
- Reference the ${context.mode} integration approach
- Include authentication method: ${
                detailedApiContext.authentication?.type || "standard"
            }
- Keep content concise - 3-5 bullet points maximum`;
        } else {
            technicalGuidance = `
TECHNICAL GUIDANCE:
- Focus on high-level ${context.mode} ${context.direction} architecture
- Describe overall data flow and integration approach
- Include standard authentication and security considerations
- Keep content concise - 3-5 bullet points maximum`;
        }

        return `
You are generating ONLY the "Technical Design Specifications" section content for a ${
            context.mode
        } ${context.direction} integration between ${context.client} and ${
            context.vendor
        }.

DO NOT generate a full document, headers, or multiple sections. Generate ONLY the content for this specific section.

INTEGRATION CONTEXT:
- Type: ${context.mode} ${context.direction}
- Client: ${context.client}
- Vendor: ${context.vendor}
- Business Logic: ${context.businessLogic || ""}
- Modules: ${context.modules.join(", ") || "Core modules"}

${technicalGuidance}

EXAMPLES TO FOLLOW (Match this exact style and length):
${exampleText}

CRITICAL REQUIREMENTS:
- Generate ONLY bullet points for the Technical Design Specifications section
- NO document headers, section numbers, or multiple sections
- Keep content CONCISE - exactly like examples (3-5 bullet points maximum)
- Focus on HIGH-LEVEL architecture and data flow overview
- NO detailed technical breakdowns, API documentation, or data mapping
- Include integration approach, authentication method, and basic architecture only
- Use bullet points format exactly matching the examples
- Be specific to the integration type but keep descriptions brief

Generate ONLY the Technical Design Specifications section content as bullet points - nothing else.`.trim();
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
