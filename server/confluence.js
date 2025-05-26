const axios = require("axios");
const { marked } = require("marked");
const { Graphviz } = require("@hpcc-js/wasm-graphviz");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class ConfluenceGenerator {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || process.env.CONFLUENCE_BASE_URL;
        this.username = config.username || process.env.CONFLUENCE_USERNAME;
        this.apiToken = config.apiToken || process.env.CONFLUENCE_API_TOKEN;
        this.spaceKey =
            config.spaceKey || process.env.CONFLUENCE_SPACE_KEY || "BRD";

        // NEW: Parent page for organization (optional)
        this.parentPageId =
            config.parentPageId || process.env.CONFLUENCE_PARENT_PAGE_ID;

        // Validate configuration
        if (!this.baseUrl || !this.username || !this.apiToken) {
            console.warn(
                "⚠️ Confluence configuration incomplete. Some fields missing."
            );
        }

        // Remove trailing slash from baseUrl if present
        if (this.baseUrl) {
            this.baseUrl = this.baseUrl.replace(/\/$/, "");
        }

        // Configure marked for HTML conversion
        marked.setOptions({
            breaks: true,
            gfm: true,
            sanitize: false,
        });

        // Confluence API client with improved authentication
        this.client = axios.create({
            baseURL: `${this.baseUrl}/wiki/rest/api`,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            auth: {
                username: this.username,
                password: this.apiToken,
            },
            timeout: 30000, // 30 second timeout
        });

        // Add request interceptor for debugging
        this.client.interceptors.request.use(
            (config) => {
                console.log(
                    `🔗 Confluence API Request: ${config.method.toUpperCase()} ${
                        config.url
                    }`
                );
                return config;
            },
            (error) => {
                console.error("❌ Request interceptor error:", error);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for debugging
        this.client.interceptors.response.use(
            (response) => {
                console.log(
                    `✅ Confluence API Response: ${response.status} ${response.statusText}`
                );
                return response;
            },
            (error) => {
                console.error("❌ Confluence API Error:", {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    message: error.response?.data?.message || error.message,
                    url: error.config?.url,
                });
                return Promise.reject(error);
            }
        );

        // Initialize Graphviz
        this.graphviz = null;
        this.initializeGraphviz();

        // NEW: Page management cache
        this.pageCache = new Map();
        this.lockManager = new Map();
    }

    // NEW: Generate unique page identifier for this BRD
    generateBRDPageId(brdData) {
        const metadata = brdData.metadata || {};
        const detailsTable = brdData.detailsTable || {};

        console.log("🔍 Debug generateBRDPageId - DetailsTable:", detailsTable);

        // Support both direct data structure and nested detailsTable structure
        const client = detailsTable.Client || brdData.client || "Unknown";
        const useCase = brdData.businessUseCase || "Integration";
        const vendor = detailsTable.Vendor || brdData.vendor || "System";
        const timestamp = metadata.createdAt || new Date().toISOString();

        console.log("🔍 Debug generateBRDPageId - Extracted values:", {
            client,
            useCase,
            vendor,
        });

        // Create hash for uniqueness using more specific data + session ID for extra uniqueness
        const sessionId =
            metadata.sessionId || Math.random().toString(36).substring(7);
        const uniqueString = `${client}-${vendor}-${useCase}-${timestamp}-${sessionId}`;
        const hash = crypto
            .createHash("md5")
            .update(uniqueString)
            .digest("hex")
            .substring(0, 8);

        const pageId = `BRD-${client.replace(/[^a-zA-Z0-9]/g, "")}-${hash}`;
        console.log("🔍 Debug generateBRDPageId - Generated:", pageId);

        return pageId;
    }

    // NEW: Check if page exists by title
    async findExistingBRDPage(pageTitle) {
        try {
            const searchParams = {
                cql: `space="${this.spaceKey}" AND type="page" AND title="${pageTitle}"`,
                limit: 1,
                expand: "version",
            };

            const response = await this.client.get("/content/search", {
                params: searchParams,
            });

            if (response.data.results.length > 0) {
                const page = response.data.results[0];
                return {
                    exists: true,
                    pageId: page.id,
                    version: page.version.number,
                    lastModified: page.version.when,
                };
            }

            return { exists: false };
        } catch (error) {
            console.error("❌ Error searching for existing page:", error);
            return { exists: false };
        }
    }

    // NEW: Distributed locking mechanism using Confluence page properties
    async acquirePageLock(pageIdentifier, timeoutMs = 30000) {
        const lockKey = `lock-${pageIdentifier}`;
        const lockValue = `${Date.now()}-${Math.random()}`;
        const expiryTime = Date.now() + timeoutMs;

        console.log(`🔒 Attempting to acquire lock for: ${pageIdentifier}`);

        // Check if we already have a lock
        if (this.lockManager.has(lockKey)) {
            const existingLock = this.lockManager.get(lockKey);
            if (existingLock.expiry > Date.now()) {
                console.log(`✅ Reusing existing lock for: ${pageIdentifier}`);
                return existingLock.value;
            } else {
                this.lockManager.delete(lockKey);
            }
        }

        // Try to acquire new lock
        try {
            // Create a temporary lock page in a locks space or use page properties
            const lockPageTitle = `LOCK-${pageIdentifier}-${Date.now()}`;

            const lockPage = await this.client.post("/content", {
                type: "page",
                title: lockPageTitle,
                space: { key: this.spaceKey },
                body: {
                    storage: {
                        value: `<p>Lock for ${pageIdentifier} - ${lockValue}</p>`,
                        representation: "storage",
                    },
                },
                metadata: {
                    properties: {
                        lockIdentifier: { value: pageIdentifier },
                        lockValue: { value: lockValue },
                        lockExpiry: { value: expiryTime.toString() },
                    },
                },
            });

            // Store lock locally
            this.lockManager.set(lockKey, {
                value: lockValue,
                expiry: expiryTime,
                pageId: lockPage.data.id,
            });

            console.log(`✅ Lock acquired for: ${pageIdentifier}`);
            return lockValue;
        } catch (error) {
            if (
                error.response?.status === 400 &&
                error.response?.data?.message?.includes("title")
            ) {
                // Lock already exists, wait and retry
                console.log(`⏳ Lock exists for ${pageIdentifier}, waiting...`);
                await new Promise((resolve) =>
                    setTimeout(resolve, 1000 + Math.random() * 2000)
                );

                if (Date.now() < expiryTime - 5000) {
                    return await this.acquirePageLock(
                        pageIdentifier,
                        timeoutMs - 3000
                    );
                }
            }

            console.error(
                `❌ Failed to acquire lock for ${pageIdentifier}:`,
                error.message
            );
            throw new Error(`Cannot acquire lock for ${pageIdentifier}`);
        }
    }

    // NEW: Release distributed lock
    async releasePageLock(pageIdentifier, lockValue) {
        const lockKey = `lock-${pageIdentifier}`;

        try {
            const lock = this.lockManager.get(lockKey);
            if (lock && lock.value === lockValue && lock.pageId) {
                // Delete the lock page
                await this.client.delete(`/content/${lock.pageId}`);
                console.log(`🔓 Lock released for: ${pageIdentifier}`);
            }

            this.lockManager.delete(lockKey);
        } catch (error) {
            console.warn(
                `⚠️ Error releasing lock for ${pageIdentifier}:`,
                error.message
            );
            // Clean up local lock anyway
            this.lockManager.delete(lockKey);
        }
    }

    async initializeGraphviz() {
        try {
            this.graphviz = await Graphviz.load();
            console.log("🎨 Graphviz initialized successfully");
        } catch (error) {
            console.error("❌ Failed to initialize Graphviz:", error);
        }
    }

    // Smart content type detection based on key names and value structures
    detectContentType(key, value) {
        console.log(`🔍 detectContentType called for: ${key}`);
        console.log(`🔍 Value structure:`, {
            type: typeof value,
            hasTypeField:
                typeof value === "object" &&
                value !== null &&
                value.hasOwnProperty("type"),
            explicitType:
                typeof value === "object" && value !== null
                    ? value.type
                    : "none",
            isArray: Array.isArray(value),
            hasContent:
                typeof value === "object" &&
                value !== null &&
                value.hasOwnProperty("content"),
        });

        // PRIORITY 1: Check if the value is an object with explicit type field (from AI)
        if (
            typeof value === "object" &&
            value !== null &&
            value.hasOwnProperty("type")
        ) {
            console.log(
                `🎯 AI content detected - using explicit type: ${value.type} for ${key}`
            );
            return value.type;
        }

        console.log(
            `🔍 No explicit type found, using key-based detection for: ${key}`
        );

        const keyLower = key.toLowerCase();

        // Table detection based on key name
        if (
            keyLower.includes("table") ||
            keyLower.includes("mapping") ||
            keyLower.includes("specification")
        ) {
            console.log(`🔍 Key-based detection: ${key} -> table`);
            return "table";
        }

        // Diagram detection
        if (
            keyLower.includes("diagram") ||
            keyLower.includes("flow") ||
            keyLower.includes("architecture")
        ) {
            console.log(`🔍 Key-based detection: ${key} -> diagram`);
            return "diagram";
        }

        // Code/API detection
        if (
            keyLower.includes("code") ||
            keyLower.includes("api") ||
            keyLower.includes("endpoint")
        ) {
            console.log(`🔍 Key-based detection: ${key} -> code`);
            return "code";
        }

        // Based on value structure
        if (Array.isArray(value)) {
            // Check if it's an array of objects (table data)
            if (
                value.length > 0 &&
                typeof value[0] === "object" &&
                !Array.isArray(value[0])
            ) {
                console.log(
                    `🔍 Structure-based detection: ${key} -> table (array of objects)`
                );
                return "table";
            }
            // Regular array (list)
            console.log(`🔍 Structure-based detection: ${key} -> list`);
            return "list";
        }

        if (typeof value === "object" && value !== null) {
            // Check if it's a structured object that could be a table
            if (this.isTableLikeObject(value)) {
                console.log(
                    `🔍 Structure-based detection: ${key} -> table (table-like object)`
                );
                return "table";
            }
            // Check if it's diagram data
            if (value.code || value.format === "graphviz") {
                console.log(`🔍 Structure-based detection: ${key} -> diagram`);
                return "diagram";
            }
            // Regular object
            console.log(`🔍 Structure-based detection: ${key} -> object`);
            return "object";
        }

        if (typeof value === "string") {
            // Check for markdown patterns
            if (this.hasMarkdownPatterns(value)) {
                console.log(`🔍 String-based detection: ${key} -> markdown`);
                return "markdown";
            }
            // Check for code patterns
            if (this.hasCodePatterns(value)) {
                console.log(`🔍 String-based detection: ${key} -> code`);
                return "code";
            }
            console.log(`🔍 String-based detection: ${key} -> text`);
            return "text";
        }

        console.log(`🔍 Fallback detection: ${key} -> text`);
        return "text";
    }

    // Check if object structure suggests it should be a table
    isTableLikeObject(obj) {
        const keys = Object.keys(obj);
        if (keys.length < 2) return false;

        // Check if all values are similar types (suggesting table columns)
        const valueTypes = keys.map((key) => typeof obj[key]);
        const hasConsistentTypes = valueTypes.every(
            (type) =>
                type === "string" ||
                type === "number" ||
                Array.isArray(obj[keys[0]])
        );

        return hasConsistentTypes;
    }

    // Detect markdown patterns in text
    hasMarkdownPatterns(text) {
        const markdownPatterns = [
            /^\s*#+\s/, // Headers
            /\*\*.*\*\*/, // Bold
            /\*.*\*/, // Italic
            /^\s*[-*+]\s/, // Lists
            /^\s*\d+\.\s/, // Numbered lists
            /\[.*\]\(.*\)/, // Links
            /```[\s\S]*```/, // Code blocks
            /`.*`/, // Inline code
        ];

        return markdownPatterns.some((pattern) => pattern.test(text));
    }

    // Detect code patterns in text
    hasCodePatterns(text) {
        const codePatterns = [
            /^digraph\s+\w+\s*{/, // Graphviz
            /^\s*{\s*"/, // JSON
            /^\s*<\w+/, // XML/HTML
            /function\s+\w+\s*\(/, // JavaScript function
            /class\s+\w+/, // Class definition
            /import\s+.*from/, // Import statements
        ];

        return codePatterns.some((pattern) => pattern.test(text));
    }

    // Convert markdown to Confluence HTML
    markdownToConfluenceHtml(markdown) {
        // First, convert markdown to HTML using marked
        let html = marked(markdown);

        // Convert standard HTML to Confluence storage format
        return this.convertHtmlToConfluenceFormat(html);
    }

    // Convert HTML to Confluence storage format
    convertHtmlToConfluenceFormat(html) {
        // Replace standard HTML with Confluence macros and format
        return (
            html
                // Convert headers
                .replace(/<h1>(.*?)<\/h1>/g, "<h1>$1</h1>")
                .replace(/<h2>(.*?)<\/h2>/g, "<h2>$1</h2>")
                .replace(/<h3>(.*?)<\/h3>/g, "<h3>$1</h3>")
                .replace(/<h4>(.*?)<\/h4>/g, "<h4>$1</h4>")

                // Convert code blocks to Confluence code macro
                .replace(
                    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
                    '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">$1</ac:parameter><ac:plain-text-body><![CDATA[$2]]></ac:plain-text-body></ac:structured-macro>'
                )
                .replace(
                    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
                    '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[$1]]></ac:plain-text-body></ac:structured-macro>'
                )

                // Convert inline code
                .replace(/<code>(.*?)<\/code>/g, "<code>$1</code>")

                // Convert blockquotes to info macro
                .replace(
                    /<blockquote>([\s\S]*?)<\/blockquote>/g,
                    '<ac:structured-macro ac:name="info"><ac:rich-text-body>$1</ac:rich-text-body></ac:structured-macro>'
                )

                // Keep basic formatting
                .replace(/<strong>(.*?)<\/strong>/g, "<strong>$1</strong>")
                .replace(/<em>(.*?)<\/em>/g, "<em>$1</em>")
                .replace(/<p>(.*?)<\/p>/g, "<p>$1</p>")
                .replace(/<br\s*\/?>/g, "<br/>")

                // Clean up any remaining HTML entities
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")
        );
    }

    // Smart content generation based on detected type - ENHANCED TO HANDLE AI STRUCTURE
    async generateSmartContent(key, value, contentType) {
        console.log(`🤖 generateSmartContent called for: ${key}`);
        console.log(`🤖 Content type: ${contentType}`);
        console.log(`🤖 Value type: ${typeof value}`);
        console.log(`🤖 Value structure:`, {
            hasTypeField:
                typeof value === "object" &&
                value !== null &&
                value.hasOwnProperty("type"),
            explicitType:
                typeof value === "object" && value !== null
                    ? value.type
                    : "none",
            hasContent:
                typeof value === "object" &&
                value !== null &&
                value.hasOwnProperty("content"),
            contentType:
                typeof value === "object" && value !== null && value.content
                    ? typeof value.content
                    : "none",
        });

        // Handle AI-generated content structure with explicit type field
        if (
            typeof value === "object" &&
            value !== null &&
            value.hasOwnProperty("type")
        ) {
            console.log(
                `🤖 Processing AI-generated content: ${key} (type: ${value.type})`
            );

            // Handle different AI content structures based on type
            switch (value.type) {
                case "table":
                    console.log(
                        `🤖 Routing to generateTableContentFromAI for: ${key}`
                    );
                    // Tables have headers and data fields
                    return this.generateTableContentFromAI(key, value);
                case "text":
                    console.log(
                        `🤖 Routing to generateTextContentFromAI for: ${key}`
                    );
                    // Text has content field
                    return this.generateTextContentFromAI(key, value.content);
                case "list":
                    console.log(
                        `🤖 Routing to generateListContentFromAI for: ${key}`
                    );
                    // Lists have content field
                    return this.generateListContentFromAI(key, value.content);
                case "diagram":
                    console.log(
                        `🤖 Routing to generateDiagramContentFromAI for: ${key}`
                    );
                    // Diagrams have content field
                    return await this.generateDiagramContentFromAI(key, value);
                case "code":
                    console.log(
                        `🤖 Routing to generateCodeContentFromAI for: ${key}`
                    );
                    // Code has content field
                    return this.generateCodeContentFromAI(key, value.content);
                default:
                    console.log(
                        `🤖 Unknown AI type ${value.type}, falling back to text for: ${key}`
                    );
                    // Fallback to text if unknown type
                    return this.generateTextContentFromAI(
                        key,
                        value.content || String(value)
                    );
            }
        }

        console.log(
            `🤖 Processing non-AI content with fallback logic for: ${key} (contentType: ${contentType})`
        );

        // Fallback to original detection logic for non-AI content
        switch (contentType) {
            case "table":
                console.log(`🤖 Fallback: generateTableContent for: ${key}`);
                return this.generateTableContent(key, value);
            case "list":
                console.log(`🤖 Fallback: generateListContent for: ${key}`);
                return this.generateListContent(key, value);
            case "diagram":
                console.log(`🤖 Fallback: generateDiagramContent for: ${key}`);
                return await this.generateDiagramContent(key, value);
            case "code":
                console.log(`🤖 Fallback: generateCodeContent for: ${key}`);
                return this.generateCodeContent(key, value);
            case "markdown":
                console.log(`🤖 Fallback: generateMarkdownContent for: ${key}`);
                return this.generateMarkdownContent(key, value);
            case "object":
                console.log(`🤖 Fallback: generateObjectContent for: ${key}`);
                return this.generateObjectContent(key, value);
            case "text":
            default:
                console.log(`🤖 Fallback: generateTextContent for: ${key}`);
                return this.generateTextContent(key, value);
        }
    }

    // ENHANCED: Utility function to escape HTML and handle objects properly
    escapeHtml(text) {
        if (!text && text !== 0) return "";

        // Handle different data types properly
        let stringValue;
        if (typeof text === "object" && text !== null) {
            if (Array.isArray(text)) {
                // Convert arrays to comma-separated values
                stringValue = text
                    .map((item) =>
                        typeof item === "object"
                            ? JSON.stringify(item)
                            : String(item)
                    )
                    .join(", ");
            } else {
                // Convert objects to readable JSON
                try {
                    stringValue = JSON.stringify(text, null, 2);
                } catch (error) {
                    stringValue = Object.prototype.toString.call(text);
                }
            }
        } else {
            stringValue = String(text);
        }

        return stringValue
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // ENHANCED: Convert markdown formatting to HTML (bold, italic, etc.)
    processMarkdownFormatting(text) {
        if (typeof text !== "string") return this.escapeHtml(text);

        // First escape HTML entities to prevent conflicts
        let processed = text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

        // Then apply markdown formatting
        processed = processed
            // Convert **bold** to <strong>
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            // Convert *italic* to <em>
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            // Convert `code` to <code>
            .replace(/`(.*?)`/g, "<code>$1</code>")
            // Convert [text](url) to links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
            // Convert newlines to <br> tags
            .replace(/\n/g, "<br/>");

        return processed;
    }

    // COMPLETELY REWRITTEN: Advanced table generation with section-specific logic
    generateTableContentFromAI(key, aiContent) {
        let tableHtml = `<h3>${this.escapeHtml(key)}</h3>\n`;

        console.log(`📊 Processing table for section: ${key}`);
        console.log(`📊 AI Content structure:`, {
            hasHeaders: !!aiContent.headers,
            hasData: !!aiContent.data,
            dataType: Array.isArray(aiContent.data)
                ? "array"
                : typeof aiContent.data,
            dataLength: Array.isArray(aiContent.data)
                ? aiContent.data.length
                : "N/A",
            hasValidationRules: !!aiContent.validationRules,
            hasTransformationNotes: !!aiContent.transformationNotes,
        });

        // Check if AI provided proper table structure
        if (aiContent.headers && aiContent.data) {
            console.log(
                `📊 Generating table with ${
                    aiContent.headers.length
                } columns and ${
                    Array.isArray(aiContent.data)
                        ? aiContent.data.length
                        : "unknown"
                } rows`
            );

            tableHtml += '<table class="confluenceTable"><tbody>\n';

            // Add header row with proper styling
            tableHtml += "<tr>";
            aiContent.headers.forEach((header) => {
                tableHtml += `<th class="confluenceTh">${this.escapeHtml(
                    header
                )}</th>`;
            });
            tableHtml += "</tr>\n";

            // Process data rows with enhanced logic
            if (Array.isArray(aiContent.data)) {
                // Standard array of data
                aiContent.data.forEach((row, rowIndex) => {
                    tableHtml += "<tr>";

                    if (Array.isArray(row)) {
                        // Row is an array - use positional mapping
                        row.forEach((cell, cellIndex) => {
                            const cellContent = this.processCellContent(
                                cell,
                                key,
                                aiContent.headers[cellIndex]
                            );
                            tableHtml += `<td class="confluenceTd">${cellContent}</td>`;
                        });

                        // Fill missing cells if row is shorter than headers
                        for (
                            let i = row.length;
                            i < aiContent.headers.length;
                            i++
                        ) {
                            tableHtml += `<td class="confluenceTd">-</td>`;
                        }
                    } else if (typeof row === "object" && row !== null) {
                        // Row is an object - use header mapping
                        aiContent.headers.forEach((header) => {
                            const cellValue = row[header] || "";
                            const cellContent = this.processCellContent(
                                cellValue,
                                key,
                                header
                            );
                            tableHtml += `<td class="confluenceTd">${cellContent}</td>`;
                        });
                    } else {
                        // Single value row - span all columns
                        const cellContent = this.processCellContent(
                            row,
                            key,
                            "value"
                        );
                        tableHtml += `<td class="confluenceTd" colspan="${aiContent.headers.length}">${cellContent}</td>`;
                    }
                    tableHtml += "</tr>\n";
                });
            } else if (typeof aiContent.data === "string") {
                // Handle comma-separated data (like your example)
                const dataRows = this.parseCommaSeparatedTableData(
                    aiContent.data,
                    aiContent.headers.length
                );

                dataRows.forEach((row) => {
                    tableHtml += "<tr>";
                    row.forEach((cell, cellIndex) => {
                        const cellContent = this.processCellContent(
                            cell,
                            key,
                            aiContent.headers[cellIndex]
                        );
                        tableHtml += `<td class="confluenceTd">${cellContent}</td>`;
                    });
                    tableHtml += "</tr>\n";
                });
            }

            tableHtml += "</tbody></table>\n";

            // Add section-specific additional content
            tableHtml += this.generateSectionSpecificContent(key, aiContent);
        } else if (typeof aiContent.content === "string") {
            // No table structure - treat as formatted text
            tableHtml += `<div class="content-block">${this.processMarkdownFormatting(
                aiContent.content
            )}</div>\n`;
        } else {
            // Fallback with better messaging
            tableHtml += `<div class="panel panelHeader-info"><div class="panelHeader">No table data available for ${this.escapeHtml(
                key
            )}</div><div class="panelContent"><p>The AI did not generate table data for this section. This might be expected for text-based sections.</p></div></div>\n`;
        }

        return tableHtml;
    }

    // NEW: Parse comma-separated table data into proper rows
    parseCommaSeparatedTableData(dataString, expectedColumns) {
        console.log(
            `📊 Parsing comma-separated data: ${dataString.substring(
                0,
                100
            )}...`
        );

        // Split by commas and group into rows based on expected column count
        const items = dataString.split(",").map((item) => item.trim());
        const rows = [];

        for (let i = 0; i < items.length; i += expectedColumns) {
            const row = items.slice(i, i + expectedColumns);
            if (row.length === expectedColumns) {
                rows.push(row);
            } else {
                // Handle partial row
                while (row.length < expectedColumns) {
                    row.push("-");
                }
                rows.push(row);
            }
        }

        console.log(`📊 Parsed ${rows.length} rows from comma-separated data`);
        return rows;
    }

    // NEW: Smart cell content processing with formatting
    processCellContent(cellValue, sectionKey, columnHeader) {
        if (!cellValue && cellValue !== 0) return "-";

        let content = String(cellValue).trim();

        // Apply section-specific formatting
        const sectionLower = sectionKey.toLowerCase();
        const headerLower = (columnHeader || "").toLowerCase();

        // Format based on column type
        if (headerLower.includes("required")) {
            // Make Yes/No more prominent
            if (content.toLowerCase() === "yes") {
                content = '<strong style="color: #d04437;">Yes</strong>';
            } else if (content.toLowerCase() === "no") {
                content = '<span style="color: #707070;">No</span>';
            }
        } else if (
            headerLower.includes("type") ||
            headerLower.includes("data type")
        ) {
            // Format data types
            content = `<code>${this.escapeHtml(content)}</code>`;
        } else if (headerLower.includes("description")) {
            // Allow markdown formatting in descriptions
            content = this.processMarkdownFormatting(content);
        } else {
            // Standard cell processing
            content = this.escapeHtml(content);
        }

        return content;
    }

    // NEW: Generate section-specific additional content
    generateSectionSpecificContent(sectionKey, aiContent) {
        let additionalContent = "";
        const sectionLower = sectionKey.toLowerCase();

        // Add validation rules if present
        if (aiContent.validationRules) {
            additionalContent += `
<div class="panel panelHeader-note">
    <div class="panelHeader"><strong>Validation Rules</strong></div>
    <div class="panelContent">
        ${this.processMarkdownFormatting(aiContent.validationRules)}
    </div>
</div>\n`;
        }

        // Add transformation notes if present
        if (aiContent.transformationNotes) {
            additionalContent += `
<div class="panel panelHeader-info">
    <div class="panelHeader"><strong>Transformation Notes</strong></div>
    <div class="panelContent">
        ${this.processMarkdownFormatting(aiContent.transformationNotes)}
    </div>
</div>\n`;
        }

        // Add section-specific guidance
        if (sectionLower.includes("technical design")) {
            additionalContent += `
<div class="panel">
    <div class="panelContent">
        <p><em>💡 <strong>Note:</strong> This table defines the technical specifications and data structures for the integration.</em></p>
    </div>
</div>\n`;
        } else if (sectionLower.includes("data mapping")) {
            additionalContent += `
<div class="panel">
    <div class="panelContent">
        <p><em>🔄 <strong>Note:</strong> This table shows how data fields are mapped between source and target systems.</em></p>
    </div>
</div>\n`;
        } else if (sectionLower.includes("api")) {
            additionalContent += `
<div class="panel">
    <div class="panelContent">
        <p><em>🔌 <strong>Note:</strong> This table documents the APIs and endpoints used in the integration.</em></p>
    </div>
</div>\n`;
        }

        return additionalContent;
    }

    // ENHANCED: Generate text content from AI structure with better markdown support
    generateTextContentFromAI(key, content) {
        let textHtml = `<h3>${this.escapeHtml(key)}</h3>\n`;

        if (typeof content === "string") {
            // Enhanced markdown processing
            if (content.includes("*") && content.includes("\n")) {
                // Convert bullet points to HTML list with better formatting
                const lines = content.split("\n").filter((line) => line.trim());
                let inList = false;

                lines.forEach((line) => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith("*")) {
                        if (!inList) {
                            textHtml += '<ul class="content-list">\n';
                            inList = true;
                        }
                        const bulletContent = trimmed.substring(1).trim();
                        // Apply markdown formatting to bullet content
                        textHtml += `<li>${this.processMarkdownFormatting(
                            bulletContent
                        )}</li>\n`;
                    } else {
                        if (inList) {
                            textHtml += "</ul>\n";
                            inList = false;
                        }
                        if (trimmed) {
                            // Apply markdown formatting to paragraphs
                            textHtml += `<p>${this.processMarkdownFormatting(
                                trimmed
                            )}</p>\n`;
                        }
                    }
                });

                if (inList) {
                    textHtml += "</ul>\n";
                }
            } else {
                // Enhanced paragraph processing with markdown support
                const paragraphs = content
                    .split("\n\n")
                    .filter((p) => p.trim());
                paragraphs.forEach((paragraph) => {
                    const formattedParagraph = this.processMarkdownFormatting(
                        paragraph.trim()
                    );
                    textHtml += `<p>${formattedParagraph}</p>\n`;
                });
            }
        } else {
            // Better object handling
            textHtml += `<p>${this.escapeHtml(content)}</p>\n`;
        }

        return textHtml;
    }

    // NEW: Generate list content from AI structure
    generateListContentFromAI(key, content) {
        let listHtml = `<h3>${this.escapeHtml(key)}</h3>\n<ul>\n`;

        if (Array.isArray(content)) {
            content.forEach((item) => {
                listHtml += `<li>${this.escapeHtml(String(item))}</li>\n`;
            });
        } else if (typeof content === "string") {
            // Parse string as list items
            const items = content.split("\n").filter((line) => line.trim());
            items.forEach((item) => {
                const cleaned = item.replace(/^[*\-+]\s*/, "").trim();
                if (cleaned) {
                    listHtml += `<li>${this.escapeHtml(cleaned)}</li>\n`;
                }
            });
        }

        listHtml += "</ul>\n";
        return listHtml;
    }

    // NEW: Generate diagram content from AI structure
    async generateDiagramContentFromAI(key, aiContent) {
        let diagramHtml = `<h3>${this.escapeHtml(key)}</h3>\n`;

        let code = "";
        let language = "dot";

        // Extract diagram code from AI structure
        if (aiContent.content && typeof aiContent.content === "string") {
            code = aiContent.content;
        } else if (aiContent.code) {
            code = aiContent.code;
        }

        // Detect language
        if (code.startsWith("digraph") || code.includes("->")) {
            language = "dot";
        } else if (code.includes("graph TD") || code.includes("flowchart")) {
            language = "mermaid";
        }

        console.log(`🎨 Processing ${language} diagram: ${key}`);

        // Try to generate image for Graphviz diagrams
        if (language === "dot" && code.trim()) {
            try {
                // Generate SVG directly without page ID requirement
                console.log("🔄 Attempting to generate diagram image...");

                // Initialize Graphviz if not already done
                if (!this.graphviz) {
                    await this.initializeGraphviz();
                }

                // Generate SVG
                const svg = this.graphviz.dot(code);
                const svgString = svg.outerHTML;

                // Embed SVG directly in the content
                diagramHtml += `
<div class="diagram-container" style="text-align: center; margin: 20px 0;">
    ${svgString}
</div>

<ac:structured-macro ac:name="expand">
    <ac:parameter ac:name="title">View Diagram Source Code</ac:parameter>
    <ac:rich-text-body>
        <ac:structured-macro ac:name="code">
            <ac:parameter ac:name="language">${language}</ac:parameter>
            <ac:parameter ac:name="title">${this.escapeHtml(
                key
            )} Source</ac:parameter>
            <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
        </ac:structured-macro>
    </ac:rich-text-body>
</ac:structured-macro>
                `.trim();

                console.log("✅ Diagram image generated successfully");
            } catch (error) {
                console.error(
                    "❌ Failed to generate diagram image:",
                    error.message
                );

                // Fallback to code display
                diagramHtml += `
<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    <ac:parameter ac:name="title">${this.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>

<ac:structured-macro ac:name="info">
    <ac:rich-text-body>
        <p><strong>Note:</strong> This is a ${language.toUpperCase()} diagram. Image generation failed: ${
                    error.message
                }</p>
    </ac:rich-text-body>
</ac:structured-macro>
                `.trim();
            }
        } else {
            // Display as code with proper formatting for non-DOT diagrams
            diagramHtml += `
<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    <ac:parameter ac:name="title">${this.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>

<ac:structured-macro ac:name="info">
    <ac:rich-text-body>
        <p><strong>Note:</strong> This is a ${language.toUpperCase()} diagram. Use an appropriate renderer to visualize this diagram.</p>
    </ac:rich-text-body>
</ac:structured-macro>
            `.trim();
        }

        return diagramHtml;
    }

    // NEW: Generate code content from AI structure
    generateCodeContentFromAI(key, content) {
        let codeHtml = `<h3>${this.escapeHtml(key)}</h3>\n`;

        let code = "";
        let language = "text";

        if (typeof content === "string") {
            code = content;

            // Auto-detect language
            if (content.startsWith("{") && content.endsWith("}")) {
                language = "json";
            } else if (
                content.includes("function") ||
                content.includes("const ")
            ) {
                language = "javascript";
            } else if (content.includes("digraph")) {
                language = "dot";
            } else if (content.includes("<") && content.includes(">")) {
                language = "xml";
            }
        }

        codeHtml += `
<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    <ac:parameter ac:name="title">${this.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>
        `.trim();

        return codeHtml;
    }

    // Generate table content from various input formats
    generateTableContent(key, value) {
        let tableHtml = `<h3>${this.escapeHtml(key)}</h3>\n<table><tbody>\n`;

        if (Array.isArray(value)) {
            // Array of objects -> table rows
            if (value.length > 0 && typeof value[0] === "object") {
                const headers = Object.keys(value[0]);

                // Add header row
                tableHtml += "<tr>";
                headers.forEach((header) => {
                    tableHtml += `<th>${this.escapeHtml(header)}</th>`;
                });
                tableHtml += "</tr>\n";

                // Add data rows
                value.forEach((row) => {
                    tableHtml += "<tr>";
                    headers.forEach((header) => {
                        const cellValue = row[header] || "";
                        tableHtml += `<td>${this.escapeHtml(
                            String(cellValue)
                        )}</td>`;
                    });
                    tableHtml += "</tr>\n";
                });
            }
        } else if (typeof value === "object" && value !== null) {
            // Object -> key-value table
            Object.entries(value).forEach(([objKey, objValue]) => {
                tableHtml += "<tr>";
                tableHtml += `<td><strong>${this.escapeHtml(
                    objKey
                )}</strong></td>`;

                if (Array.isArray(objValue)) {
                    tableHtml += `<td>${objValue
                        .map((item) => this.escapeHtml(String(item)))
                        .join(", ")}</td>`;
                } else {
                    tableHtml += `<td>${this.escapeHtml(
                        String(objValue)
                    )}</td>`;
                }
                tableHtml += "</tr>\n";
            });
        }

        tableHtml += "</tbody></table>\n";
        return tableHtml;
    }

    // Generate list content
    generateListContent(key, value) {
        let listHtml = `<h3>${this.escapeHtml(key)}</h3>\n<ul>\n`;

        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (
                    typeof item === "string" &&
                    this.hasMarkdownPatterns(item)
                ) {
                    listHtml += `<li>${this.markdownToConfluenceHtml(
                        item
                    )}</li>\n`;
                } else {
                    listHtml += `<li>${this.escapeHtml(String(item))}</li>\n`;
                }
            });
        }

        listHtml += "</ul>\n";
        return listHtml;
    }

    // Generate diagram content
    async generateDiagramContent(key, value) {
        let diagramHtml = `<h3>${this.escapeHtml(key)}</h3>\n`;

        let code = "";
        let language = "dot";

        if (typeof value === "object" && value.code) {
            code = value.code;
            language = value.format || value.language || "dot";
        } else if (typeof value === "string") {
            code = value;
            // Auto-detect language
            if (value.startsWith("digraph") || value.includes("->")) {
                language = "dot";
            } else if (
                value.includes("graph TD") ||
                value.includes("flowchart")
            ) {
                language = "mermaid";
            }
        }

        // Try to generate and upload image for Graphviz diagrams
        if (language === "dot" && code.trim()) {
            try {
                const imageResult = await this.generateGraphvizImage(code, key);

                if (imageResult) {
                    // Show the uploaded image
                    diagramHtml += `
<ac:image ac:align="center" ac:width="800">
    <ri:attachment ri:filename="${imageResult.title}" />
</ac:image>

<ac:structured-macro ac:name="expand">
    <ac:parameter ac:name="title">View Diagram Source Code</ac:parameter>
    <ac:rich-text-body>
        <ac:structured-macro ac:name="code">
            <ac:parameter ac:name="language">${language}</ac:parameter>
            <ac:parameter ac:name="title">${this.escapeHtml(
                key
            )} - Source</ac:parameter>
            <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
        </ac:structured-macro>
    </ac:rich-text-body>
</ac:structured-macro>
                    `.trim();

                    console.log(
                        `✅ Generated and uploaded diagram image for: ${key}`
                    );
                    return diagramHtml;
                }
            } catch (error) {
                console.error("❌ Failed to generate diagram image:", error);
                // Fall through to code display
            }
        }

        // Fallback: Show code with instructions
        diagramHtml += `
<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    <ac:parameter ac:name="title">${this.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>

<ac:structured-macro ac:name="info">
    <ac:rich-text-body>
        <p><strong>Note:</strong> This is a ${language.toUpperCase()} diagram. ${
            language === "dot"
                ? "Automatic image generation failed - please use a Graphviz renderer to visualize this diagram."
                : "Use an appropriate renderer or Confluence plugin to visualize this diagram."
        }</p>
    </ac:rich-text-body>
</ac:structured-macro>
        `.trim();

        return diagramHtml;
    }

    // Generate code content
    generateCodeContent(key, value) {
        let codeHtml = `<h3>${this.escapeHtml(key)}</h3>\n`;

        let code = "";
        let language = "text";

        if (typeof value === "object" && value.code) {
            code = value.code;
            language = value.language || "text";
        } else if (typeof value === "string") {
            code = value;

            // Auto-detect language
            if (value.startsWith("{") && value.endsWith("}")) {
                language = "json";
            } else if (value.includes("function") || value.includes("const ")) {
                language = "javascript";
            } else if (value.includes("digraph")) {
                language = "dot";
            } else if (value.includes("<") && value.includes(">")) {
                language = "xml";
            }
        }

        codeHtml += `
<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    <ac:parameter ac:name="title">${this.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>
        `.trim();

        return codeHtml;
    }

    // Generate markdown content
    generateMarkdownContent(key, value) {
        const html = `<h3>${this.escapeHtml(
            key
        )}</h3>\n${this.markdownToConfluenceHtml(value)}`;
        return html;
    }

    // Generate object content (structured display)
    generateObjectContent(key, value) {
        let objectHtml = `<h3>${this.escapeHtml(key)}</h3>\n`;

        // Check if it should be displayed as a table instead
        if (this.isTableLikeObject(value)) {
            return this.generateTableContent(key, value);
        }

        // Display as expandable JSON
        objectHtml += `
<ac:structured-macro ac:name="expand">
    <ac:parameter ac:name="title">View Details</ac:parameter>
    <ac:rich-text-body>
        <ac:structured-macro ac:name="code">
            <ac:parameter ac:name="language">json</ac:parameter>
            <ac:plain-text-body><![CDATA[${JSON.stringify(
                value,
                null,
                2
            )}]]></ac:plain-text-body>
        </ac:structured-macro>
    </ac:rich-text-body>
</ac:structured-macro>
        `.trim();

        return objectHtml;
    }

    // Generate text content
    generateTextContent(key, value) {
        const content = String(value);
        let textHtml = `<h3>${this.escapeHtml(key)}</h3>\n`;

        // Check if it contains markdown-like formatting
        if (this.hasMarkdownPatterns(content)) {
            textHtml += this.markdownToConfluenceHtml(content);
        } else {
            // Format as paragraphs
            const paragraphs = content.split("\n\n").filter((p) => p.trim());
            paragraphs.forEach((paragraph) => {
                textHtml += `<p>${this.escapeHtml(paragraph.trim())}</p>\n`;
            });
        }

        return textHtml;
    }

    // COMPLETELY REWRITTEN: Multi-level duplicate prevention system
    async performDuplicateCheck(brdData) {
        try {
            console.log("🔍 Performing comprehensive duplicate check...");

            const detailsTable = brdData.detailsTable || {};
            const client = detailsTable.Client || detailsTable.client || "";
            const vendor = detailsTable.Vendor || detailsTable.vendor || "";
            const businessUseCase = brdData.businessUseCase || "";

            // LEVEL 1: Exact title match check
            const pageTitle = this.generatePageTitle(brdData);
            const exactMatch = await this.findExistingBRDPage(pageTitle);

            if (exactMatch.exists) {
                console.log(
                    `📋 Level 1 - Exact title match found: ${exactMatch.pageId}`
                );
                return {
                    exists: true,
                    pageId: exactMatch.pageId,
                    title: pageTitle,
                    version: exactMatch.version,
                    level: "exact_title",
                };
            }

            // LEVEL 2: Search for similar BRDs with same client/vendor/use case
            const searchQueries = [
                // Most specific search
                `"${client}" AND "${vendor}" AND "${businessUseCase}"`,
                // Broader searches
                `"${client}" AND "${vendor}" AND "BRD"`,
                `"${businessUseCase}" AND "${client}" AND "BRD"`,
                `"${vendor}" AND "${client}" AND "Integration"`,
            ].filter((query) => {
                // Only include queries with valid (non-empty) terms
                const terms = query.match(/"[^"]+"/g);
                return terms && terms.every((term) => term.length > 3); // Ignore empty or very short terms
            });

            for (let i = 0; i < searchQueries.length; i++) {
                const query = searchQueries[i];
                try {
                    console.log(`🔍 Level 2.${i + 1} - Searching: ${query}`);

                    const searchResults = await this.client.get(
                        "/content/search",
                        {
                            params: {
                                cql: `space.key="${this.spaceKey}" AND type=page AND (title~"${query}" OR text~"${query}")`,
                                limit: 20,
                                expand: "version,body.storage",
                            },
                        }
                    );

                    if (
                        searchResults.data.results &&
                        searchResults.data.results.length > 0
                    ) {
                        // Analyze results for similarity
                        for (const result of searchResults.data.results) {
                            const similarityScore = this.calculateSimilarity(
                                brdData,
                                result
                            );

                            if (similarityScore > 0.8) {
                                // 80% similarity threshold
                                console.log(
                                    `📋 Level 2.${
                                        i + 1
                                    } - High similarity match found (${Math.round(
                                        similarityScore * 100
                                    )}%): ${result.title}`
                                );
                                return {
                                    exists: true,
                                    pageId: result.id,
                                    title: result.title,
                                    version: result.version.number,
                                    level: `similarity_${i + 1}`,
                                    similarity: similarityScore,
                                };
                            }
                        }
                    }
                } catch (searchError) {
                    console.warn(
                        `⚠️ Level 2.${i + 1} search failed: ${query}`,
                        searchError.message
                    );
                    // Continue with next search query
                }
            }

            // LEVEL 3: Recent pages check (last 24 hours)
            try {
                console.log("🔍 Level 3 - Recent pages check...");
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);

                const recentResults = await this.client.get("/content/search", {
                    params: {
                        cql: `space.key="${
                            this.spaceKey
                        }" AND type=page AND created >= "${
                            yesterday.toISOString().split("T")[0]
                        }" AND title~"BRD"`,
                        limit: 50,
                        expand: "version",
                        orderby: "created desc",
                    },
                });

                if (
                    recentResults.data.results &&
                    recentResults.data.results.length > 0
                ) {
                    for (const result of recentResults.data.results) {
                        if (this.isLikelyDuplicate(brdData, result)) {
                            console.log(
                                `📋 Level 3 - Recent duplicate detected: ${result.title}`
                            );
                            return {
                                exists: true,
                                pageId: result.id,
                                title: result.title,
                                version: result.version.number,
                                level: "recent_duplicate",
                            };
                        }
                    }
                }
            } catch (recentError) {
                console.warn(
                    "⚠️ Level 3 recent pages check failed:",
                    recentError.message
                );
            }

            console.log("✅ No duplicates found - safe to create new page");
            return { exists: false, level: "none" };
        } catch (error) {
            console.warn(
                "⚠️ Comprehensive duplicate check failed:",
                error.message
            );
            // In case of failure, assume no duplicates to avoid blocking creation
            return { exists: false, level: "check_failed" };
        }
    }

    // NEW: Calculate similarity between BRD data and existing page
    calculateSimilarity(brdData, existingPage) {
        try {
            const detailsTable = brdData.detailsTable || {};
            const client = detailsTable.Client || "";
            const vendor = detailsTable.Vendor || "";
            const businessUseCase = brdData.businessUseCase || "";

            const title = existingPage.title || "";

            let score = 0;
            let factors = 0;

            // Check client match
            if (client && title.toLowerCase().includes(client.toLowerCase())) {
                score += 0.4;
            }
            factors++;

            // Check vendor match
            if (vendor && title.toLowerCase().includes(vendor.toLowerCase())) {
                score += 0.3;
            }
            factors++;

            // Check use case match
            if (
                businessUseCase &&
                title.toLowerCase().includes(businessUseCase.toLowerCase())
            ) {
                score += 0.3;
            }
            factors++;

            return factors > 0 ? score : 0;
        } catch (error) {
            console.warn("⚠️ Similarity calculation failed:", error.message);
            return 0;
        }
    }

    // NEW: Quick heuristic check for likely duplicates
    isLikelyDuplicate(brdData, existingPage) {
        try {
            const detailsTable = brdData.detailsTable || {};
            const client = detailsTable.Client || "";
            const vendor = detailsTable.Vendor || "";

            const title = existingPage.title.toLowerCase();

            // If both client and vendor appear in title, it's likely a duplicate
            return (
                client &&
                vendor &&
                title.includes(client.toLowerCase()) &&
                title.includes(vendor.toLowerCase()) &&
                title.includes("brd")
            );
        } catch (error) {
            return false;
        }
    }

    // COMPLETELY REWRITTEN: Bulletproof page creation with comprehensive error handling
    async createBRDPage(brdData, options = {}) {
        let lockValue = null;
        let pageIdentifier = null;
        const maxRetries = options.maxRetries || 5;
        const baseDelay = options.baseDelay || 2000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(
                    `📄 Creating Confluence BRD page with bulletproof architecture... (attempt ${attempt}/${maxRetries})`
                );

                // STEP 1: Generate unique identifiers with enhanced entropy
                pageIdentifier = this.generateBRDPageId(brdData);

                console.log(`🏷️ Page Identifier: ${pageIdentifier}`);

                // STEP 2: Acquire distributed lock with timeout
                console.log(
                    `🔒 Acquiring distributed lock for: ${pageIdentifier}`
                );
                try {
                    lockValue = await this.acquirePageLock(
                        pageIdentifier,
                        45000
                    ); // Increased timeout
                } catch (lockError) {
                    console.log(
                        `⏳ Lock acquisition failed: ${lockError.message}`
                    );
                    if (attempt < maxRetries) {
                        const delay =
                            baseDelay * Math.pow(2, attempt - 1) +
                            Math.random() * 1000;
                        console.log(
                            `⏳ Waiting ${Math.ceil(
                                delay / 1000
                            )}s before retry...`
                        );
                        await this.sleep(delay);
                        continue;
                    } else {
                        return {
                            success: false,
                            error: "Unable to acquire distributed lock after multiple attempts",
                            suggestion:
                                "System is under heavy load. Please try again in a few minutes.",
                            attempts: attempt,
                        };
                    }
                }

                console.log(`✅ Lock acquired: ${lockValue}`);

                try {
                    // STEP 3: Comprehensive duplicate prevention
                    console.log(
                        "🔍 Performing comprehensive duplicate check..."
                    );
                    const duplicateCheck = await this.performDuplicateCheck(
                        brdData
                    );

                    if (duplicateCheck.exists) {
                        console.log(
                            `📝 Duplicate found (${duplicateCheck.level}): ${duplicateCheck.pageId}`
                        );

                        // UPDATE existing page instead of creating new one
                        const updateResult = await this.updateSpecificBRDPage(
                            duplicateCheck.pageId,
                            brdData,
                            { ...options, skipLocking: true } // Skip locking since we already have it
                        );

                        return {
                            ...updateResult,
                            operation: "update_existing",
                            duplicateDetection: duplicateCheck.level,
                            lockUsed: pageIdentifier,
                            attempts: attempt,
                        };
                    }

                    // STEP 4: Generate absolutely unique page title
                    const pageTitle = this.generatePageTitle(brdData);
                    console.log(`📋 Unique Page Title: ${pageTitle}`);

                    // STEP 5: Final safety check - exact title search
                    console.log(
                        "🔍 Final safety check - exact title search..."
                    );
                    const finalCheck = await this.findExistingBRDPage(
                        pageTitle
                    );

                    if (finalCheck.exists) {
                        console.log(
                            `📝 Final check found duplicate: ${finalCheck.pageId} - updating instead`
                        );

                        const updateResult = await this.updateSpecificBRDPage(
                            finalCheck.pageId,
                            brdData,
                            { ...options, skipLocking: true }
                        );

                        return {
                            ...updateResult,
                            operation: "update_final_check",
                            lockUsed: pageIdentifier,
                            attempts: attempt,
                        };
                    }

                    // STEP 6: Create new page with enhanced error handling
                    console.log("📄 Creating new page (no duplicates found)");
                    const createResult = await this.createNewBRDPageSafe(
                        brdData,
                        pageTitle,
                        options
                    );

                    if (createResult.success) {
                        return {
                            ...createResult,
                            operation: "create",
                            lockUsed: pageIdentifier,
                            attempts: attempt,
                        };
                    } else {
                        // Handle creation failures
                        if (createResult.isDuplicate) {
                            console.log(
                                "📝 Creation failed due to duplicate - searching for the created page..."
                            );
                            // Someone else created a page with same title, find and update it
                            const createdPage = await this.findExistingBRDPage(
                                pageTitle
                            );
                            if (createdPage.exists) {
                                const updateResult =
                                    await this.updateSpecificBRDPage(
                                        createdPage.pageId,
                                        brdData,
                                        { ...options, skipLocking: true }
                                    );
                                return {
                                    ...updateResult,
                                    operation: "update_race_condition",
                                    lockUsed: pageIdentifier,
                                    attempts: attempt,
                                };
                            }
                        }

                        // Other creation failures - retry if possible
                        throw new Error(createResult.error);
                    }
                } finally {
                    // STEP 7: Always release lock
                    if (lockValue && pageIdentifier) {
                        console.log(`🔓 Releasing lock: ${pageIdentifier}`);
                        await this.releasePageLock(pageIdentifier, lockValue);
                    }
                }
            } catch (error) {
                console.error(
                    `❌ Error in createBRDPage (attempt ${attempt}):`,
                    error.message
                );

                // Release lock on error
                if (lockValue && pageIdentifier) {
                    try {
                        await this.releasePageLock(pageIdentifier, lockValue);
                        lockValue = null;
                    } catch (lockError) {
                        console.warn(
                            "⚠️ Error releasing lock during error handling:",
                            lockError.message
                        );
                    }
                }

                // Handle different types of errors
                const isRetryableError = this.isRetryableError(error);

                if (isRetryableError && attempt < maxRetries) {
                    const delay = this.calculateRetryDelay(attempt, error);
                    console.log(
                        `⏳ Retryable error detected. Waiting ${Math.ceil(
                            delay / 1000
                        )}s before retry...`
                    );
                    await this.sleep(delay);
                    continue;
                }

                // Non-retryable error or max retries exceeded
                return {
                    success: false,
                    error: error.message,
                    details: error.response?.data,
                    statusCode: error.response?.status,
                    attempts: attempt,
                    suggestion: this.generateComprehensiveErrorSuggestion(
                        error,
                        attempt
                    ),
                };
            }
        }

        // This should never be reached
        return {
            success: false,
            error: "Maximum retry attempts exceeded",
            attempts: maxRetries,
            suggestion:
                "System is experiencing issues. Please try again later or contact support.",
        };
    }

    // NEW: Safe page creation with comprehensive error handling
    async createNewBRDPageSafe(brdData, pageTitle, options = {}) {
        try {
            console.log("📄 Creating new Confluence page safely...");

            // Convert BRD data to Confluence storage format
            const content = await this.generateConfluenceContent(brdData);

            // Create page payload
            const pagePayload = {
                type: "page",
                title: pageTitle,
                space: {
                    key: this.spaceKey,
                },
                body: {
                    storage: {
                        value: content,
                        representation: "storage",
                    },
                },
            };

            // Add parent page if specified
            if (options.parentPageId || this.parentPageId) {
                const parentId = options.parentPageId || this.parentPageId;
                console.log(`📎 Setting parent page ID: ${parentId}`);
                pagePayload.ancestors = [{ id: parentId }];
            }

            console.log("🚀 Publishing new page to Confluence...");
            console.log("Payload structure:", {
                type: pagePayload.type,
                title: pagePayload.title,
                spaceKey: pagePayload.space.key,
                hasParent: !!pagePayload.ancestors,
                contentLength: content.length,
            });

            const response = await this.client.post("/content", pagePayload);

            const pageUrl = `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${response.data.id}`;

            console.log("✅ New Confluence page created successfully");
            console.log(`🔗 Page URL: ${pageUrl}`);

            // Cache the new page
            this.pageCache.set(pageTitle, {
                pageId: response.data.id,
                version: response.data.version.number,
                lastUpdated: Date.now(),
            });

            return {
                success: true,
                pageId: response.data.id,
                pageTitle: pageTitle,
                pageUrl: pageUrl,
                spaceKey: this.spaceKey,
                version: response.data.version.number,
                operation: "create",
            };
        } catch (error) {
            console.error("❌ Error creating new page:", {
                status: error.response?.status,
                statusText: error.response?.statusText,
                message: error.response?.data?.message || error.message,
                data: error.response?.data,
            });

            // Specific error handling
            if (error.response?.status === 400) {
                const message = error.response?.data?.message || "";
                if (
                    message.includes("title already exists") ||
                    message.includes("same TITLE")
                ) {
                    return {
                        success: false,
                        error: "A page with this title already exists. The system will automatically update the existing page instead.",
                        isDuplicate: true,
                        details: error.response?.data,
                    };
                } else {
                    return {
                        success: false,
                        error: "Bad request. Check page content format.",
                        details: error.response?.data,
                    };
                }
            } else if (error.response?.status === 403) {
                return {
                    success: false,
                    error: "Permission denied. You may not have permission to create pages in this space.",
                    details: error.response?.data,
                };
            } else {
                return {
                    success: false,
                    error: error.response?.data?.message || error.message,
                    details: error.response?.data,
                };
            }
        }
    }

    // NEW: Comprehensive error classification
    isRetryableError(error) {
        const status = error.response?.status;
        const message = error.message?.toLowerCase() || "";

        // Retryable status codes
        if (
            status === 409 || // Version conflicts
            status === 429 || // Rate limits
            status === 502 || // Bad Gateway
            status === 503 || // Service Unavailable
            status === 504
        ) {
            // Gateway Timeout
            return true;
        }

        // Network/connection errors
        if (
            error.code === "ECONNRESET" ||
            error.code === "ETIMEDOUT" ||
            error.code === "ENOTFOUND" ||
            message.includes("timeout") ||
            message.includes("network") ||
            message.includes("connection")
        ) {
            return true;
        }

        // Temporary server errors
        if (status >= 500) {
            return true;
        }

        // Database-related temporary errors
        if (
            message.includes("stale") ||
            message.includes("hibernate") ||
            message.includes("database") ||
            message.includes("deadlock")
        ) {
            return true;
        }

        return false;
    }

    // NEW: Smart retry delay calculation
    calculateRetryDelay(attempt, error) {
        const status = error.response?.status;
        let baseDelay = 2000; // 2 seconds base

        // Different delays for different error types
        if (status === 429) {
            // Rate limiting
            baseDelay = 10000; // 10 seconds for rate limits
        } else if (status === 409) {
            // Version conflicts
            baseDelay = 3000; // 3 seconds for version conflicts
        } else if (status >= 500) {
            // Server errors
            baseDelay = 5000; // 5 seconds for server errors
        }

        // Exponential backoff with jitter
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 2000; // Up to 2 seconds jitter
        const maxDelay = 60000; // Cap at 60 seconds

        return Math.min(exponentialDelay + jitter, maxDelay);
    }

    // NEW: Comprehensive error suggestions
    generateComprehensiveErrorSuggestion(error, attempts) {
        const status = error.response?.status;
        const message = error.message?.toLowerCase() || "";

        if (status === 400) {
            if (message.includes("title already exists")) {
                return "A page with this title already exists. The system will automatically update the existing page instead.";
            } else {
                return "Bad request detected. Please check your Confluence permissions and space configuration.";
            }
        } else if (status === 401) {
            return "Authentication failed. Please verify your Confluence API token and username.";
        } else if (status === 403) {
            return "Permission denied. Please ensure your account has permission to create/edit pages in this space.";
        } else if (status === 409) {
            return `Version conflict after ${attempts} attempts. The page is being actively modified. Please wait a few minutes and try again.`;
        } else if (status === 429) {
            return "Rate limit exceeded. Please wait a few minutes before trying again.";
        } else if (status >= 500) {
            return "Confluence server error. Please check the server status and try again later.";
        } else if (message.includes("timeout") || message.includes("network")) {
            return "Network connectivity issue. Please check your internet connection and try again.";
        } else {
            return "An unexpected error occurred. If this persists, please contact your Confluence administrator.";
        }
    }

    // Generate page title from BRD metadata - ENHANCED FOR ABSOLUTE UNIQUENESS
    generatePageTitle(brdData) {
        console.log("BRD Data", brdData);
        const metadata = brdData.metadata || {};
        const detailsTable = brdData.detailsTable || {};

        console.log("🔍 Debug generatePageTitle - DetailsTable:", detailsTable);

        // FIX: Use detailsTable.Client first, then fallback
        const client =
            detailsTable.Client || brdData.client || "Unknown Client";
        const vendor = detailsTable.Vendor || brdData.vendor || "";
        const businessUseCase = brdData.businessUseCase || "Integration";

        // ENHANCED: Generate truly unique timestamp with microseconds
        const now = new Date();
        const timestamp = now.toISOString().split("T")[0];
        const timeComponent = now
            .toISOString()
            .replace(/[-:.]/g, "")
            .slice(0, 15); // YYYYMMDDTHHMMSS

        // ENHANCED: Add session ID and random component for absolute uniqueness
        const sessionId =
            metadata.sessionId || Math.random().toString(36).substring(2, 8);
        const randomComponent = Math.random().toString(36).substring(2, 6);

        // Generate document ID with multiple uniqueness factors
        const docId = `TS-${timestamp
            .replace(/-/g, "")
            .substring(2)}-${sessionId}-${randomComponent}`;

        // Create title with guaranteed uniqueness
        const baseTitle = `${client} :: ${vendor} - ${businessUseCase} BRD`;
        const title = `${docId} ${baseTitle}`;

        console.log("🔍 Debug generatePageTitle - Generated:", title);
        console.log("🔍 Debug generatePageTitle - Uniqueness factors:", {
            docId,
            sessionId,
            randomComponent,
            timeComponent,
        });

        return title;
    }

    // Generate Confluence labels for the page
    generateLabels(brdData) {
        const labels = ["BRD", "Integration", "Generated"];

        const metadata = brdData.metadata || {};
        const detailsTable = brdData.detailsTable || {};

        // Add mode and direction labels
        if (metadata.mode)
            labels.push(metadata.mode.replace(/[^a-zA-Z0-9]/g, ""));
        if (metadata.direction) labels.push(metadata.direction);

        // Add client label
        if (detailsTable.Client) {
            labels.push(detailsTable.Client.replace(/[^a-zA-Z0-9]/g, ""));
        }

        return labels.map((label) => ({ name: label }));
    }

    // Convert BRD data to Confluence storage format (NEW MODULAR APPROACH)
    async generateConfluenceContent(brdData) {
        let content = "";

        // Add page header
        content += this.generatePageHeader(brdData);

        // Add metadata table
        content += this.generateMetadataSection(brdData);

        // Add generated content sections using smart detection
        content += await this.generateSmartContentSections(brdData);

        // Add technical data
        content += this.generateTechnicalDataSection(brdData);

        // Add summary and next steps
        content += this.generateSummarySection(brdData);

        return content;
    }

    // Generate content sections using smart detection (NEW)
    async generateSmartContentSections(brdData) {
        // FIX: AI generator puts content in 'sections', not 'generatedContent'
        const generatedContent =
            brdData.sections || brdData.generatedContent || {};
        let sectionsHtml = "";

        console.log(
            "🔍 Debug generateSmartContentSections - Available sections:",
            Object.keys(generatedContent)
        );

        // Process all sections asynchronously
        const sectionPromises = Object.entries(generatedContent).map(
            async ([sectionName, content]) => {
                console.log(
                    `📝 Processing section: ${sectionName} (type: ${typeof content})`
                );

                // Detect content type
                const contentType = this.detectContentType(
                    sectionName,
                    content
                );

                console.log(
                    `🎯 Detected content type for ${sectionName}: ${contentType}`
                );

                // Generate appropriate content
                const sectionHtml = await this.generateSmartContent(
                    sectionName,
                    content,
                    contentType
                );

                return { sectionName, sectionHtml };
            }
        );

        // Wait for all sections to be processed
        const processedSections = await Promise.all(sectionPromises);

        // Combine all sections in the original order
        processedSections.forEach(({ sectionHtml }) => {
            sectionsHtml += sectionHtml + "\n";
        });

        console.log(
            `✅ Generated ${processedSections.length} content sections (${sectionsHtml.length} chars total)`
        );

        return sectionsHtml;
    }

    // Generate page header with BRD title and overview
    generatePageHeader(brdData) {
        const metadata = brdData.metadata || {};
        const detailsTable = brdData.detailsTable || {};

        return `

        `.trim();
    }

    // Generate metadata table
    generateMetadataSection(brdData) {
        const detailsTable = brdData.detailsTable || {};

        let metadataRows = "";
        Object.entries(detailsTable).forEach(([key, value]) => {
            if (value && value.toString().trim()) {
                metadataRows += `
<tr>
    <td><strong>${this.escapeHtml(key)}</strong></td>
    <td>${this.escapeHtml(value.toString())}</td>
</tr>`;
            }
        });

        return `
<h2>Integration Details</h2>
<table>
    <tbody>
        ${metadataRows}
    </tbody>
</table>
        `.trim();
    }

    // Generate technical data section
    generateTechnicalDataSection(brdData) {
        const technicalData = brdData.technicalData;
        if (!technicalData) return "";

        let techSection = "<h2>Technical Data</h2>\n";

        if (technicalData.csv && technicalData.csv.data) {
            const csvData = technicalData.csv.data;
            techSection += "<h3>Data Mapping</h3>\n";

            // Fix: csvData.rows is already an array of objects, not an array of arrays
            if (
                csvData.rows &&
                Array.isArray(csvData.rows) &&
                csvData.rows.length > 0
            ) {
                // If rows are objects, use them directly
                if (
                    typeof csvData.rows[0] === "object" &&
                    !Array.isArray(csvData.rows[0])
                ) {
                    techSection += this.generateTableContent(
                        "Data Mapping",
                        csvData.rows
                    );
                } else {
                    // If rows are arrays, convert to objects using headers
                    const tableObjects = csvData.rows.map((row) => {
                        const obj = {};
                        csvData.headers.forEach((header, index) => {
                            obj[header] = Array.isArray(row)
                                ? row[index] || ""
                                : row[header] || "";
                        });
                        return obj;
                    });
                    techSection += this.generateTableContent(
                        "Data Mapping",
                        tableObjects
                    );
                }
            } else {
                techSection +=
                    "<p><em>No data mapping information available.</em></p>\n";
            }
        }

        return techSection;
    }

    // Generate summary and next steps section
    generateSummarySection(brdData) {
        const summary = brdData.summary || {};

        let summarySection = "<h2>Summary</h2>\n";

        if (summary.totalOutputs) {
            summarySection += `<p><strong>Total Outputs Generated:</strong> ${summary.totalOutputs}</p>\n`;
        }

        if (summary.integrationComplexity) {
            summarySection += `<p><strong>Integration Complexity:</strong> ${summary.integrationComplexity}</p>\n`;
        }

        if (
            summary.recommendedNextSteps &&
            summary.recommendedNextSteps.length > 0
        ) {
            summarySection += "<h3>Recommended Next Steps</h3>\n<ul>\n";
            summary.recommendedNextSteps.forEach((step) => {
                summarySection += `<li>${this.escapeHtml(step)}</li>\n`;
            });
            summarySection += "</ul>\n";
        }

        // Add generation metadata
        summarySection += `
<ac:structured-macro ac:name="info">
    <ac:parameter ac:name="title">Generation Information</ac:parameter>
    <ac:rich-text-body>
        <p><strong>Generated by:</strong> AI-Powered BRD Generator</p>
        <p><strong>Generated at:</strong> ${
            brdData.metadata?.generatedAt || new Date().toISOString()
        }</p>
        <p><strong>Integration Pattern:</strong> ${
            brdData.metadata?.integrationPattern || "N/A"
        }</p>
    </ac:rich-text-body>
</ac:structured-macro>
        `;

        return summarySection;
    }

    // Search for existing BRD pages
    async searchBRDPages(query = "", limit = 25) {
        try {
            const searchParams = {
                cql: `space="${
                    this.spaceKey
                }" AND type="page" AND title~"BRD" ${
                    query ? `AND text~"${query}"` : ""
                }`,
                limit: limit,
                expand: "version",
            };

            const response = await this.client.get("/content/search", {
                params: searchParams,
            });

            return {
                success: true,
                pages: response.data.results.map((page) => ({
                    id: page.id,
                    title: page.title,
                    url: `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${page.id}`,
                    lastModified: page.version?.when || "Unknown",
                    version: page.version?.number || 1,
                })),
            };
        } catch (error) {
            console.error(
                "❌ Error searching Confluence pages:",
                error.response?.data || error.message
            );
            return {
                success: false,
                error: error.response?.data?.message || error.message,
            };
        }
    }

    // Test connection to Confluence
    async testConnection() {
        try {
            console.log("🔍 Testing Confluence connection...");
            console.log(`Base URL: ${this.baseUrl}`);
            console.log(`Username: ${this.username}`);
            console.log(`Space Key: ${this.spaceKey}`);

            // First, test basic authentication with a simple API call
            try {
                console.log("🔐 Testing authentication...");
                const userResponse = await this.client.get("/user/current");
                console.log(
                    `✅ Authenticated as: ${userResponse.data.displayName} (${userResponse.data.username})`
                );
            } catch (authError) {
                console.error(
                    "❌ Authentication failed:",
                    authError.response?.data || authError.message
                );

                if (authError.response?.status === 401) {
                    return {
                        success: false,
                        error: "Authentication failed. Please check your username and API token.",
                        statusCode: 401,
                        suggestion:
                            "Verify your Confluence username and API token. Make sure you're using an API token, not your password.",
                    };
                } else if (authError.response?.status === 403) {
                    return {
                        success: false,
                        error: "Access forbidden. Your account may not have sufficient permissions to access Confluence.",
                        statusCode: 403,
                        suggestion:
                            "Contact your Confluence administrator to ensure your account has proper permissions.",
                    };
                } else {
                    return {
                        success: false,
                        error:
                            authError.response?.data?.message ||
                            authError.message,
                        statusCode: authError.response?.status,
                        suggestion:
                            "Please check your Confluence URL, username, and API token.",
                    };
                }
            }

            // If authentication works, try to access the specific BRD space
            try {
                console.log(`🏢 Testing access to space '${this.spaceKey}'...`);
                const spaceResponse = await this.client.get(
                    `/space/${this.spaceKey}`
                );
                console.log(
                    `✅ Successfully accessed space: ${spaceResponse.data.name}`
                );

                return {
                    success: true,
                    message: `Successfully connected to Confluence space '${this.spaceKey}'`,
                    spaceName: spaceResponse.data.name,
                    spaceKey: this.spaceKey,
                };
            } catch (spaceError) {
                console.log(
                    `⚠️ Space '${this.spaceKey}' not found or not accessible`
                );

                // If BRD space doesn't exist, try to list accessible spaces
                try {
                    console.log("📋 Listing available spaces...");
                    const spacesResponse = await this.client.get("/space", {
                        params: { limit: 10 },
                    });

                    const availableSpaces = spacesResponse.data.results.map(
                        (space) => ({
                            key: space.key,
                            name: space.name,
                        })
                    );

                    console.log(
                        `Found ${availableSpaces.length} accessible spaces`
                    );

                    return {
                        success: false,
                        error: `Space '${this.spaceKey}' not found or not accessible`,
                        availableSpaces: availableSpaces,
                        suggestion: `Please create a space with key '${this.spaceKey}' or update your configuration to use one of the available spaces.`,
                    };
                } catch (listError) {
                    console.error(
                        "❌ Cannot list spaces:",
                        listError.response?.data || listError.message
                    );

                    return {
                        success: false,
                        error: `Connected to Confluence but cannot access spaces. Please check permissions.`,
                        statusCode: listError.response?.status,
                        suggestion:
                            "Contact your Confluence administrator to ensure your account has permission to view spaces.",
                    };
                }
            }
        } catch (error) {
            console.error("❌ Unexpected error in testConnection:", error);

            return {
                success: false,
                error: error.response?.data?.message || error.message,
                statusCode: error.response?.status,
                suggestion:
                    "Please check your Confluence URL, username, and API token.",
            };
        }
    }

    // Create BRD space if it doesn't exist
    async createBRDSpace() {
        try {
            const spacePayload = {
                key: this.spaceKey,
                name: "Business Requirements Documents",
                description: {
                    plain: {
                        value: "This space contains generated Business Requirements Documents (BRDs) for various integrations and projects.",
                        representation: "plain",
                    },
                },
                type: "global",
            };

            console.log(`🏗️ Creating Confluence space '${this.spaceKey}'...`);
            const response = await this.client.post("/space", spacePayload);

            return {
                success: true,
                message: `Successfully created Confluence space '${this.spaceKey}'`,
                spaceKey: response.data.key,
                spaceName: response.data.name,
                spaceUrl: `${this.baseUrl}/spaces/${response.data.key}`,
            };
        } catch (error) {
            console.error(
                `❌ Error creating space:`,
                error.response?.data || error.message
            );
            return {
                success: false,
                error: error.response?.data?.message || error.message,
                statusCode: error.response?.status,
            };
        }
    }

    // Generate and upload Graphviz image
    async generateGraphvizImage(dotCode, title = "Diagram") {
        if (!this.graphviz) {
            console.warn(
                "⚠️ Graphviz not initialized, falling back to code display"
            );
            return null;
        }

        try {
            console.log("🎨 Generating Graphviz image...");

            // Generate SVG from DOT code
            const svg = this.graphviz.dot(dotCode);

            // Convert SVG to PNG using Sharp
            const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

            // Create temporary file
            const tempDir = path.join(__dirname, "temp");
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const timestamp = Date.now();
            const filename = `diagram_${timestamp}.png`;
            const filepath = path.join(tempDir, filename);

            fs.writeFileSync(filepath, pngBuffer);

            // Upload image to Confluence
            const attachmentResult = await this.uploadAttachment(
                filepath,
                filename,
                title
            );

            // Clean up temporary file
            fs.unlinkSync(filepath);

            return attachmentResult;
        } catch (error) {
            console.error("❌ Error generating Graphviz image:", error);
            return null;
        }
    }

    // Upload attachment to Confluence
    async uploadAttachment(filepath, filename, title) {
        try {
            if (!this.pageId) {
                console.warn("⚠️ No page ID available for attachment upload");
                return null;
            }

            console.log(`📎 Uploading attachment: ${filename}`);

            const FormData = require("form-data");
            const form = new FormData();

            form.append("file", fs.createReadStream(filepath), {
                filename: filename,
                contentType: "image/png",
            });

            form.append("comment", `Generated diagram: ${title}`);
            form.append("minorEdit", "true");

            const response = await axios.post(
                `${this.baseUrl}/wiki/rest/api/content/${this.pageId}/child/attachment`,
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        "X-Atlassian-Token": "no-check",
                    },
                    auth: {
                        username: this.username,
                        password: this.apiToken,
                    },
                }
            );

            console.log("✅ Attachment uploaded successfully");

            return {
                id: response.data.results[0].id,
                title: response.data.results[0].title,
                downloadUrl: `${this.baseUrl}/wiki${response.data.results[0]._links.download}`,
            };
        } catch (error) {
            console.error(
                "❌ Error uploading attachment:",
                error.response?.data || error.message
            );
            return null;
        }
    }

    // NEW: Update a specific page by ID (no conflicts possible)
    async updateSpecificBRDPage(pageId, brdData, options = {}) {
        const maxRetries = options.maxRetries || 5;
        const baseDelay = options.baseDelay || 1000;
        const maxDelay = options.maxDelay || 30000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(
                    `📝 Updating specific page: ${pageId} (attempt ${attempt}/${maxRetries})`
                );

                // Acquire page lock to prevent concurrent modifications
                const lockIdentifier = `page-${pageId}-${Date.now()}`;
                const lockAcquired = await this.acquirePageLock(
                    lockIdentifier,
                    30000
                );

                if (!lockAcquired && attempt === 1) {
                    console.log(
                        "⏳ Page is locked by another process, waiting..."
                    );
                    await this.sleep(2000);
                    continue;
                }

                try {
                    // Get current page state with fresh version
                    const currentPage = await this.client.get(
                        `/content/${pageId}`,
                        {
                            params: { expand: "version,space,body.storage" },
                        }
                    );

                    const currentVersion = currentPage.data.version.number;
                    console.log(
                        `📊 Current page version: ${currentVersion} (attempt ${attempt})`
                    );

                    // Generate updated content
                    const content = await this.generateConfluenceContent(
                        brdData
                    );

                    // Update with proper version increment
                    const updatePayload = {
                        version: { number: currentVersion + 1 },
                        title: this.generatePageTitle(brdData),
                        type: "page",
                        body: {
                            storage: {
                                value: content,
                                representation: "storage",
                            },
                        },
                    };

                    console.log(
                        `🚀 Updating page with version: ${currentVersion + 1}`
                    );

                    const response = await this.client.put(
                        `/content/${pageId}`,
                        updatePayload,
                        {
                            headers: {
                                "Content-Type": "application/json",
                                "X-Atlassian-Token": "no-check",
                            },
                        }
                    );

                    // Release lock on success
                    if (lockAcquired) {
                        await this.releasePageLock(
                            lockIdentifier,
                            lockIdentifier
                        );
                    }

                    const pageUrl = `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${pageId}`;

                    console.log(
                        `✅ Page updated successfully on attempt ${attempt}`
                    );
                    return {
                        success: true,
                        pageId: pageId,
                        pageTitle: response.data.title,
                        pageUrl: pageUrl,
                        version: response.data.version.number,
                        previousVersion: currentVersion,
                        operation: "update",
                        attempts: attempt,
                    };
                } finally {
                    // STEP 7: Always release lock
                    if (lockAcquired) {
                        await this.releasePageLock(
                            lockIdentifier,
                            lockIdentifier
                        );
                    }
                }
            } catch (error) {
                console.error(
                    `❌ Error updating page ${pageId} (attempt ${attempt}):`,
                    error.message
                );

                // Handle version conflicts (409) with exponential backoff
                if (error.response?.status === 409) {
                    if (attempt < maxRetries) {
                        // Calculate exponential backoff delay
                        let delay = baseDelay * Math.pow(2, attempt - 1);

                        // Add jitter to prevent thundering herd
                        delay += Math.random() * 1000;

                        // Cap the delay
                        delay = Math.min(delay, maxDelay);

                        console.log(
                            `🔄 Version conflict detected. Retrying in ${Math.ceil(
                                delay / 1000
                            )}s... (attempt ${attempt + 1}/${maxRetries})`
                        );
                        await this.sleep(delay);
                        continue;
                    } else {
                        return {
                            success: false,
                            error: `Version conflict: Page was modified by another user after ${maxRetries} attempts`,
                            details: error.response?.data,
                            statusCode: 409,
                            attempts: attempt,
                            suggestion:
                                "The page is being actively modified by another user. Please wait a few minutes and try again, or coordinate with other team members.",
                        };
                    }
                }

                // Handle rate limiting (429) with longer delays
                if (error.response?.status === 429) {
                    if (attempt < maxRetries) {
                        const delay = Math.min(10000 * attempt, maxDelay); // 10s, 20s, 30s...
                        console.log(
                            `🚫 Rate limited. Waiting ${Math.ceil(
                                delay / 1000
                            )}s before retry...`
                        );
                        await this.sleep(delay);
                        continue;
                    }
                }

                // Handle other retryable errors (5xx, timeouts)
                const isRetryableError =
                    error.response?.status >= 500 ||
                    error.code === "ECONNRESET" ||
                    error.code === "ETIMEDOUT" ||
                    error.message.includes("timeout");

                if (isRetryableError && attempt < maxRetries) {
                    const delay = Math.min(baseDelay * attempt, maxDelay);
                    console.log(
                        `⚠️ Retryable error. Waiting ${Math.ceil(
                            delay / 1000
                        )}s before retry...`
                    );
                    await this.sleep(delay);
                    continue;
                }

                // Non-retryable error or max retries exceeded
                return {
                    success: false,
                    error: error.message,
                    details: error.response?.data,
                    statusCode: error.response?.status,
                    attempts: attempt,
                    suggestion: this.generateErrorSuggestion(
                        error.response?.status,
                        error.message,
                        attempt
                    ),
                };
            }
        }

        // This should never be reached, but just in case
        return {
            success: false,
            error: "Maximum retry attempts exceeded",
            attempts: maxRetries,
            suggestion:
                "Please try again later or contact support if the issue persists.",
        };
    }

    // Sleep utility for delays
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

module.exports = ConfluenceGenerator;
