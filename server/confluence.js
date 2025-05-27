const axios = require("axios");

class ConfluenceGenerator {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || process.env.CONFLUENCE_BASE_URL;
        this.username = config.username || process.env.CONFLUENCE_USERNAME;
        this.apiToken = config.apiToken || process.env.CONFLUENCE_API_TOKEN;
        this.spaceKey =
            config.spaceKey || process.env.CONFLUENCE_SPACE_KEY || "BRD";
        this.parentPageId =
            config.parentPageId || process.env.CONFLUENCE_PARENT_PAGE_ID;

        // NEW: Internal page management
        this.currentPageId = null;
        this.currentPageTitle = null;
        this.currentPageVersion = null;
        this.pageHistory = []; // Track all created pages in this session

        if (!this.baseUrl || !this.username || !this.apiToken) {
            console.warn(
                "⚠️ Confluence configuration incomplete. Some fields missing."
            );
        }

        if (this.baseUrl) {
            this.baseUrl = this.baseUrl.replace(/\/$/, "");
        }

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
            timeout: 30000,
        });

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
    }

    // FIXED: Content type detection for AI-generated content
    detectContentType(key, value) {
        console.log(`📝 Processing section: ${key} (type: ${typeof value})`);

        if (!value) return "empty";

        // Handle AI-generated objects with type field
        if (typeof value === "object" && value !== null && value.type) {
            console.log(`🎯 AI object detected with type: ${value.type}`);
            return value.type; // Return the AI-specified type
        }

        if (typeof value === "string") {
            if (value.includes("*   ") || value.includes("\n*")) {
                return "text";
            }
            return value.length > 100 ? "text" : "short_text";
        }

        if (Array.isArray(value)) {
            if (value.length === 0) return "empty";
            return this.isTableData(value) ? "table" : "list";
        }

        if (typeof value === "object" && value !== null) {
            if (value.headers && value.data) return "table";
            return "object";
        }

        return "unknown";
    }

    // FIXED: Smart content routing by type
    generateSmartContent(key, value, contentType = null) {
        console.log(`🤖 Processing: ${key} (type: ${contentType || "auto"})`);

        const detectedType = contentType || this.detectContentType(key, value);

        // FIXED: Proper routing based on AI content type
        switch (detectedType) {
            case "text":
                return this.generateTextContent(key, value);
            case "table":
                return this.generateTableContent(key, value);
            case "diagram":
                return this.generateDiagramContent(key, value);
            case "list":
                return this.generateListContent(key, value);
            case "code":
                return this.generateCodeContent(key, value);
            default:
                return this.generateTextContent(key, value);
        }
    }

    // Helper: Check if array represents table data
    isTableData(value) {
        if (!Array.isArray(value) || value.length === 0) return false;

        if (
            typeof value[0] === "object" &&
            value[0] !== null &&
            !Array.isArray(value[0])
        ) {
            const firstKeys = Object.keys(value[0]);
            return firstKeys.length > 1;
        }

        return Array.isArray(value[0]);
    }

    // Helper: Escape HTML content
    escapeHtml(text) {
        if (!text && text !== 0) return "";

        let stringValue;
        if (typeof text === "object" && text !== null) {
            if (Array.isArray(text)) {
                stringValue = text
                    .map((item) =>
                        typeof item === "object"
                            ? JSON.stringify(item)
                            : String(item)
                    )
                    .join(", ");
            } else {
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

    // Helper: Process markdown formatting to HTML
    processMarkdownFormatting(text) {
        if (typeof text !== "string") return this.escapeHtml(text);

        // Simple markdown processing - handle the most common cases
        let processed = text;

        // Convert **bold** to <strong>
        processed = processed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

        // Convert `code` to <code>
        processed = processed.replace(/`([^`]+?)`/g, "<code>$1</code>");

        // Convert [text](url) to links
        processed = processed.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2">$1</a>'
        );

        // Escape remaining HTML characters (but not our generated tags)
        // Split by our HTML tags to process text parts separately
        const parts = processed.split(/(<\/?(?:strong|code|a)[^>]*>)/);

        for (let i = 0; i < parts.length; i++) {
            // Only escape text parts (odd indices), not HTML tags (even indices)
            if (i % 2 === 0) {
                parts[i] = parts[i]
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#39;");
            }
        }

        return parts.join("");
    }

    // Content generators for different types
    generateTextContent(key, value) {
        let content = `<h3>${this.escapeHtml(key)}</h3>\n`;

        // Extract content from AI objects
        let actualContent = value;
        if (typeof value === "object" && value !== null && value.content) {
            actualContent = value.content;
        }

        if (typeof actualContent === "string") {
            // Convert bullet points to HTML lists with markdown support
            if (actualContent.includes("*") && actualContent.includes("\n")) {
                const lines = actualContent
                    .split("\n")
                    .filter((line) => line.trim());
                let inList = false;

                lines.forEach((line) => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith("* ")) {
                        if (!inList) {
                            content += "<ul>\n";
                            inList = true;
                        }
                        const bulletContent = trimmed.substring(2).trim(); // Remove "* "
                        // Process markdown in bullet content
                        content += `<li>${this.processMarkdownFormatting(
                            bulletContent
                        )}</li>\n`;
                    } else {
                        if (inList) {
                            content += "</ul>\n";
                            inList = false;
                        }
                        if (trimmed) {
                            // Process markdown in paragraphs
                            content += `<p>${this.processMarkdownFormatting(
                                trimmed
                            )}</p>\n`;
                        }
                    }
                });

                if (inList) {
                    content += "</ul>\n";
                }
            } else {
                // Enhanced paragraph processing with markdown support
                const paragraphs = actualContent
                    .split("\n\n")
                    .filter((p) => p.trim());
                paragraphs.forEach((paragraph) => {
                    const formattedParagraph = this.processMarkdownFormatting(
                        paragraph.trim()
                    );
                    content += `<p>${formattedParagraph}</p>\n`;
                });
            }
        } else {
            content += `<p>${this.escapeHtml(String(actualContent))}</p>\n`;
        }

        return content;
    }

    generateTableContent(key, value) {
        let content = `<h3>${this.escapeHtml(key)}</h3>\n`;

        // Extract table data from AI objects
        let tableData = value;
        if (typeof value === "object" && value !== null) {
            if (value.headers && value.data) {
                // AI-generated table structure
                content += '<table class="confluenceTable"><tbody>\n';

                // Headers
                content += "<tr>";
                value.headers.forEach((header) => {
                    content += `<th class="confluenceTh">${this.escapeHtml(
                        header
                    )}</th>`;
                });
                content += "</tr>\n";

                // Data rows
                if (Array.isArray(value.data)) {
                    value.data.forEach((row) => {
                        content += "<tr>";
                        if (Array.isArray(row)) {
                            row.forEach((cell) => {
                                content += `<td class="confluenceTd">${this.escapeHtml(
                                    String(cell)
                                )}</td>`;
                            });
                        } else if (typeof row === "object") {
                            value.headers.forEach((header) => {
                                const cellValue = row[header] || "";
                                content += `<td class="confluenceTd">${this.escapeHtml(
                                    String(cellValue)
                                )}</td>`;
                            });
                        }
                        content += "</tr>\n";
                    });
                }

                content += "</tbody></table>\n";
                return content;
            } else if (value.content) {
                tableData = value.content;
            }
        }

        // Handle array data
        if (Array.isArray(tableData) && tableData.length > 0) {
            content += '<table class="confluenceTable"><tbody>\n';

            if (
                typeof tableData[0] === "object" &&
                !Array.isArray(tableData[0])
            ) {
                // Array of objects
                const headers = Object.keys(tableData[0]);

                content += "<tr>";
                headers.forEach((header) => {
                    content += `<th class="confluenceTh">${this.escapeHtml(
                        header
                    )}</th>`;
                });
                content += "</tr>\n";

                tableData.forEach((row) => {
                    content += "<tr>";
                    headers.forEach((header) => {
                        const cellValue = row[header] || "";
                        content += `<td class="confluenceTd">${this.escapeHtml(
                            String(cellValue)
                        )}</td>`;
                    });
                    content += "</tr>\n";
                });
            }

            content += "</tbody></table>\n";
        }

        return content;
    }

    generateListContent(key, value) {
        let content = `<h3>${this.escapeHtml(key)}</h3>\n<ul>\n`;

        let listData = value;
        if (typeof value === "object" && value !== null && value.content) {
            listData = value.content;
        }

        if (Array.isArray(listData)) {
            listData.forEach((item) => {
                content += `<li>${this.escapeHtml(String(item))}</li>\n`;
            });
        } else if (typeof listData === "string") {
            const items = listData.split("\n").filter((line) => line.trim());
            items.forEach((item) => {
                const cleaned = item.replace(/^[*\-+]\s*/, "").trim();
                if (cleaned) {
                    content += `<li>${this.escapeHtml(cleaned)}</li>\n`;
                }
            });
        }

        content += "</ul>\n";
        return content;
    }

    generateDiagramContent(key, value) {
        let content = `<h3>${this.escapeHtml(key)}</h3>\n`;

        let code = "";
        let language = "text";

        if (typeof value === "object" && value !== null) {
            if (value.content) {
                code = value.content;
            } else if (value.code) {
                code = value.code;
            }
            language = value.language || "text";
        } else if (typeof value === "string") {
            code = value;
            if (code.includes("digraph") || code.includes("->")) {
                language = "dot";
            }
        }

        content += `
<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    <ac:parameter ac:name="title">${this.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>
        `.trim();

        return content;
    }

    generateCodeContent(key, value) {
        let content = `<h3>${this.escapeHtml(key)}</h3>\n`;

        let code = "";
        let language = "text";

        if (typeof value === "object" && value !== null) {
            if (value.content) {
                code = value.content;
            } else if (value.code) {
                code = value.code;
            }
            language = value.language || "text";
        } else if (typeof value === "string") {
            code = value;
        }

        content += `
<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    <ac:parameter ac:name="title">${this.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>
        `.trim();

        return content;
    }

    // Main content generation
    async generateConfluenceContent(brdData) {
        let content = "";

        // Add metadata section
        content += this.generateMetadataSection(brdData);

        // Process generated sections
        const sections = brdData.sections || brdData.generatedContent || {};
        console.log("🔍 Available sections:", Object.keys(sections));

        for (const [sectionName, sectionContent] of Object.entries(sections)) {
            console.log(`📝 Processing section: ${sectionName}`);
            const sectionHtml = this.generateSmartContent(
                sectionName,
                sectionContent
            );
            content += sectionHtml + "\n";
        }

        // Add technical data if present
        if (brdData.technicalData) {
            content += this.generateTechnicalDataSection(brdData);
        }

        console.log(`✅ Generated ${content.length} characters of content`);
        return content;
    }

    generateMetadataSection(brdData) {
        const detailsTable = brdData.detailsTable || {};

        let content = "<h2>Integration Details</h2>\n<table><tbody>\n";

        Object.entries(detailsTable).forEach(([key, value]) => {
            if (value && value.toString().trim()) {
                content += `<tr><td><strong>${this.escapeHtml(
                    key
                )}</strong></td><td>${this.escapeHtml(
                    value.toString()
                )}</td></tr>\n`;
            }
        });

        content += "</tbody></table>\n";
        return content;
    }

    generateTechnicalDataSection(brdData) {
        const technicalData = brdData.technicalData;
        if (!technicalData) return "";

        let content = "<h2>Technical Data</h2>\n";

        if (technicalData.csv && technicalData.csv.data) {
            content += this.generateTableContent(
                "Data Mapping",
                technicalData.csv.data.rows
            );
        }

        return content;
    }

    // Page creation and management
    generatePageTitle(brdData) {
        const detailsTable = brdData.detailsTable || {};
        const client = detailsTable.Client || "Unknown Client";
        const vendor = detailsTable.Vendor || "";
        const useCase = brdData.businessUseCase || "Integration";

        const timestamp = new Date().toISOString().split("T")[0];
        const docId = `BRD-${timestamp}-${Math.random()
            .toString(36)
            .substring(2, 8)}`;

        return `${docId} ${client} :: ${vendor} - ${useCase} BRD`;
    }

    // NEW: Simple method to create or update BRD (handles everything automatically)
    async createOrUpdateBRD(brdData, options = {}) {
        try {
            console.log("📄 Creating or updating BRD page automatically...");

            // Generate page title
            const pageTitle = this.generatePageTitle(brdData);

            // Check if we should update existing page or create new one
            if (options.updateExisting && this.currentPageId) {
                console.log(`🔄 Updating existing page: ${this.currentPageId}`);
                return await this.updateCurrentPage(brdData);
            } else {
                console.log("📝 Creating new page");
                return await this.createNewPage(brdData, pageTitle, options);
            }
        } catch (error) {
            console.error("❌ Error in createOrUpdateBRD:", error.message);
            return {
                success: false,
                error: error.message,
                suggestion: this.getErrorSuggestion(error),
            };
        }
    }

    // NEW: Create new page and store its ID internally
    async createNewPage(brdData, pageTitle, options = {}) {
        try {
            const content = await this.generateConfluenceContent(brdData);

            const pagePayload = {
                type: "page",
                title: pageTitle,
                space: { key: this.spaceKey },
                body: {
                    storage: {
                        value: content,
                        representation: "storage",
                    },
                },
            };

            if (options.parentPageId || this.parentPageId) {
                pagePayload.ancestors = [
                    { id: options.parentPageId || this.parentPageId },
                ];
            }

            const response = await this.client.post("/content", pagePayload);

            // Store page info internally
            this.currentPageId = response.data.id;
            this.currentPageTitle = response.data.title;
            this.currentPageVersion = response.data.version.number;

            // Add to history
            this.pageHistory.push({
                id: this.currentPageId,
                title: this.currentPageTitle,
                version: this.currentPageVersion,
                createdAt: new Date().toISOString(),
                url: `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`,
            });

            const pageUrl = `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`;

            console.log("✅ New Confluence page created successfully");
            console.log(`🔗 Page URL: ${pageUrl}`);
            console.log(`📋 Page ID stored internally: ${this.currentPageId}`);

            return {
                success: true,
                pageId: this.currentPageId,
                pageTitle: this.currentPageTitle,
                pageUrl: pageUrl,
                spaceKey: this.spaceKey,
                version: this.currentPageVersion,
                operation: "create",
            };
        } catch (error) {
            console.error("❌ Error creating new page:", error.message);
            throw error;
        }
    }

    // NEW: Update current page using stored ID
    async updateCurrentPage(brdData) {
        if (!this.currentPageId) {
            throw new Error("No current page to update. Create a page first.");
        }

        try {
            // Get current page state
            const currentPage = await this.client.get(
                `/content/${this.currentPageId}`,
                {
                    params: { expand: "version" },
                }
            );

            const currentVersion = currentPage.data.version.number;
            const content = await this.generateConfluenceContent(brdData);

            const updatePayload = {
                version: { number: currentVersion + 1 },
                title: this.currentPageTitle,
                type: "page",
                body: {
                    storage: {
                        value: content,
                        representation: "storage",
                    },
                },
            };

            const response = await this.client.put(
                `/content/${this.currentPageId}`,
                updatePayload
            );

            // Update stored version
            this.currentPageVersion = response.data.version.number;

            const pageUrl = `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`;

            console.log("✅ Page updated successfully");
            console.log(`🔗 Page URL: ${pageUrl}`);

            return {
                success: true,
                pageId: this.currentPageId,
                pageTitle: this.currentPageTitle,
                pageUrl: pageUrl,
                version: this.currentPageVersion,
                previousVersion: currentVersion,
                operation: "update",
            };
        } catch (error) {
            console.error("❌ Error updating current page:", error.message);
            throw error;
        }
    }

    // NEW: Get current page info
    getCurrentPageInfo() {
        return {
            pageId: this.currentPageId,
            title: this.currentPageTitle,
            version: this.currentPageVersion,
            url: this.currentPageId
                ? `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`
                : null,
        };
    }

    // NEW: Get all pages created in this session
    getPageHistory() {
        return this.pageHistory;
    }

    // NEW: Reset current page (to create a new one)
    resetCurrentPage() {
        this.currentPageId = null;
        this.currentPageTitle = null;
        this.currentPageVersion = null;
        console.log(
            "🔄 Current page reset - next operation will create a new page"
        );
    }

    // NEW: Set current page manually (if you know the page ID)
    setCurrentPage(pageId, title = null, version = null) {
        this.currentPageId = pageId;
        this.currentPageTitle = title;
        this.currentPageVersion = version;
        console.log(`📋 Current page set to: ${pageId}`);
    }

    // NEW: Better error suggestions
    getErrorSuggestion(error) {
        const message = error.message?.toLowerCase() || "";

        if (message.includes("eai_again") || message.includes("getaddrinfo")) {
            return "DNS resolution failed. Check your Confluence URL and internet connection. Try using the full domain name.";
        } else if (message.includes("econnrefused")) {
            return "Connection refused. Verify your Confluence URL is correct and accessible.";
        } else if (message.includes("401")) {
            return "Authentication failed. Check your username and API token.";
        } else if (message.includes("403")) {
            return "Permission denied. Ensure your account has permission to create/edit pages.";
        } else if (message.includes("404")) {
            return "Space not found. Verify the space key exists and you have access.";
        } else {
            return "Check your Confluence configuration and network connection.";
        }
    }

    async testConnection() {
        try {
            console.log("🔍 Testing Confluence connection...");

            const userResponse = await this.client.get("/user/current");
            console.log(
                `✅ Authenticated as: ${userResponse.data.displayName}`
            );

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
        } catch (error) {
            console.error(
                "❌ Connection test failed:",
                error.response?.data || error.message
            );

            return {
                success: false,
                error: error.response?.data?.message || error.message,
                statusCode: error.response?.status,
            };
        }
    }

    // Legacy method for backward compatibility
    async createBRDPage(brdData, options = {}) {
        console.log(
            "⚠️ createBRDPage is deprecated. Use createOrUpdateBRD instead."
        );
        return await this.createOrUpdateBRD(brdData, options);
    }
}

module.exports = ConfluenceGenerator;
