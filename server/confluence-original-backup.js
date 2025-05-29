const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const FormData = require("form-data");
const { Graphviz } = require("@hpcc-js/wasm-graphviz");

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

    // FIXED: Smart content routing by type with technical data integration
    generateSmartContent(key, value, contentType = null, technicalData = null) {
        console.log(
            `🤖 Processing section: ${key} (type: ${contentType || "auto"})`
        );

        const detectedType = contentType || this.detectContentType(key, value);

        let result = "";
        let diagramInfo = null;

        // FIXED: Proper routing based on AI content type
        switch (detectedType) {
            case "text":
                result = this.generateTextContent(key, value);
                break;
            case "table":
                result = this.generateTableContent(key, value);
                break;
            case "diagram":
            case "graphviz": // Add support for graphviz type
                const diagramResult = this.generateDiagramContent(key, value);
                if (
                    typeof diagramResult === "object" &&
                    diagramResult.isGraphviz
                ) {
                    result = diagramResult.content;
                    diagramInfo = {
                        diagramId: diagramResult.diagramId,
                        diagramName: diagramResult.diagramName,
                        dotCode: diagramResult.dotCode,
                    };
                } else {
                    result = diagramResult.content || diagramResult;
                }
                break;
            case "list":
                result = this.generateListContent(key, value);
                break;
            case "code":
                result = this.generateCodeContent(key, value);
                break;
            default:
                result = this.generateTextContent(key, value);
                break;
        }

        // Check if there are technical files for this section and append them
        if (technicalData && Object.keys(technicalData).length > 0) {
            console.log(`🔍 Processing technical data for section: "${key}"`);
            console.log(
                `🔍 Available technical data sections:`,
                Object.keys(technicalData)
            );

            // Try exact match first
            let sectionTechnicalData = technicalData[key];

            // If no exact match, try to find a flexible match
            if (!sectionTechnicalData) {
                // Normalize the section name for comparison
                const normalizedKey = this.normalizeKeyForMatching(key);
                console.log(
                    `🔍 Normalized AI section key for matching: "${normalizedKey}" (original: "${key}")`
                );

                for (const [techKey, techData] of Object.entries(
                    technicalData
                )) {
                    // Log original keys before normalization for comparison
                    console.log(
                        `🔍 Comparing AI key: "${key}" with Technical Data key: "${techKey}"`
                    );
                    const normalizedTechKey =
                        this.normalizeKeyForMatching(techKey);
                    console.log(
                        `🔍     Normalized AI key: "${normalizedKey}" vs Normalized Tech key: "${normalizedTechKey}"`
                    );

                    if (normalizedKey === normalizedTechKey) {
                        console.log(
                            `✅ Found matching technical data: "${key}" matches "${techKey}"`
                        );
                        sectionTechnicalData = techData;
                        break;
                    }
                }
            } else {
                console.log(
                    `✅ Found exact technical data match for section: "${key}"`
                );
            }

            if (sectionTechnicalData) {
                console.log(
                    `📎 Processing technical data for section: ${key}`,
                    {
                        hasFiles: !!sectionTechnicalData.files,
                        fileCount: sectionTechnicalData.files?.length || 0,
                        sectionData: sectionTechnicalData,
                    }
                );

                if (
                    sectionTechnicalData.files &&
                    Array.isArray(sectionTechnicalData.files) &&
                    sectionTechnicalData.files.length > 0
                ) {
                    console.log(
                        `📄 Adding ${sectionTechnicalData.files.length} technical files to section: ${key}`
                    );
                    const technicalContent =
                        this.generateTechnicalFilesForSection(
                            key,
                            sectionTechnicalData
                        );
                    result += technicalContent;
                    console.log(
                        `✅ Successfully added technical attachments to section: ${key}`
                    );
                } else {
                    console.log(
                        `⚠️ No files found in technical data for section: ${key} - files:`,
                        sectionTechnicalData.files
                    );
                }
            } else {
                console.log(
                    `❌ No matching technical data found for section: "${key}"`
                );
                console.log(
                    `❌ Available technical sections: [${Object.keys(
                        technicalData
                    ).join(", ")}]`
                );
            }
        } else {
            console.log(
                `ℹ️ No technical data available for processing (technicalData:`,
                !!technicalData,
                `keys:`,
                technicalData ? Object.keys(technicalData).length : 0,
                ")"
            );
        }

        return {
            content: result,
            diagram: diagramInfo,
        };
    }

    // NEW: Normalize keys for flexible matching
    normalizeKeyForMatching(key) {
        return key
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "");
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

    generateTableContent(key, value, customHeaders = null) {
        let content = `<h3>${this.escapeHtml(key)}</h3>\n`;

        // Extract table data from AI objects
        let tableData = value;
        let headers = customHeaders;

        if (typeof value === "object" && value !== null) {
            if (value.headers && value.data) {
                // AI-generated table structure
                content += `<table class="confluenceTable">
<tbody>
`;

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

                content += "</tbody>\n</table>\n";
                return content;
            } else if (value.content) {
                tableData = value.content;
            }
        }

        // Handle array data with custom headers
        if (Array.isArray(tableData) && tableData.length > 0) {
            content += `<table class="confluenceTable">
<tbody>
`;

            if (headers && Array.isArray(headers)) {
                // Use custom headers
                content += "<tr>";
                headers.forEach((header) => {
                    content += `<th class="confluenceTh">${this.escapeHtml(
                        header
                    )}</th>`;
                });
                content += "</tr>\n";

                tableData.forEach((row) => {
                    content += "<tr>";
                    if (typeof row === "object" && !Array.isArray(row)) {
                        headers.forEach((header) => {
                            const cellValue = row[header] || "";
                            content += `<td class="confluenceTd">${this.escapeHtml(
                                String(cellValue)
                            )}</td>`;
                        });
                    } else if (Array.isArray(row)) {
                        row.forEach((cell) => {
                            content += `<td class="confluenceTd">${this.escapeHtml(
                                String(cell)
                            )}</td>`;
                        });
                    }
                    content += "</tr>\n";
                });
            } else if (
                typeof tableData[0] === "object" &&
                !Array.isArray(tableData[0])
            ) {
                // Array of objects - use object keys as headers
                const objectHeaders = Object.keys(tableData[0]);

                content += "<tr>";
                objectHeaders.forEach((header) => {
                    content += `<th class="confluenceTh">${this.escapeHtml(
                        header
                    )}</th>`;
                });
                content += "</tr>\n";

                tableData.forEach((row) => {
                    content += "<tr>";
                    objectHeaders.forEach((header) => {
                        const cellValue = row[header] || "";
                        content += `<td class="confluenceTd">${this.escapeHtml(
                            String(cellValue)
                        )}</td>`;
                    });
                    content += "</tr>\n";
                });
            }

            content += "</tbody>\n</table>\n";
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
        let isGraphviz = false;

        console.log(
            `🎯 Processing diagram content for ${key}:`,
            typeof value,
            value
        );

        if (typeof value === "object" && value !== null) {
            // Handle AI-generated objects with various content properties
            if (value.content) {
                code = value.content;
            } else if (value.code) {
                code = value.code;
            } else if (value.diagram) {
                code = value.diagram;
            } else if (value.graphviz) {
                code = value.graphviz;
            } else if (value.dot) {
                code = value.dot;
            } else {
                // If no specific content property, try to extract from the object itself
                console.log(
                    `⚠️ No specific content property found, checking object keys:`,
                    Object.keys(value)
                );
                // Try common graphviz content patterns
                const possibleKeys = [
                    "graph",
                    "digraph",
                    "subgraph",
                    "flowchart",
                ];
                for (const possibleKey of possibleKeys) {
                    if (value[possibleKey]) {
                        code = value[possibleKey];
                        break;
                    }
                }

                // If still no content, use JSON representation for debugging
                if (!code) {
                    console.log(
                        `❌ Could not extract diagram content from object:`,
                        value
                    );
                    code = JSON.stringify(value, null, 2);
                    language = "json";
                }
            }

            // Set language based on content type or object properties
            if (
                value.type === "graphviz" ||
                value.language === "dot" ||
                (typeof code === "string" &&
                    (code.includes("digraph") ||
                        code.includes("graph {") ||
                        code.includes("->")))
            ) {
                language = "dot";
                isGraphviz = true;
            } else {
                language = value.language || "text";
            }
        } else if (typeof value === "string") {
            code = value;
            if (
                code.includes("digraph") ||
                code.includes("->") ||
                code.includes("graph {")
            ) {
                language = "dot";
                isGraphviz = true;
            }
        } else {
            console.log(
                `❌ Unexpected diagram value type:`,
                typeof value,
                value
            );
            code = String(value);
        }

        console.log(
            `✅ Extracted diagram code (${code.length} chars, language: ${language}, isGraphviz: ${isGraphviz}):`,
            code.substring(0, 200) + (code.length > 200 ? "..." : "")
        );

        // For GraphViz diagrams, create a placeholder for image rendering
        if (isGraphviz && language === "dot") {
            console.log(
                `🎨 GraphViz diagram detected for ${key} - will render as image`
            );

            // Store the GraphViz data for later processing
            const diagramId = `graphviz_${key.replace(
                /[^a-zA-Z0-9]/g,
                "_"
            )}_${Date.now()}`;

            // Create a simple placeholder that will be replaced with image after upload
            content += `
<!-- GRAPHVIZ_PLACEHOLDER_${diagramId}: ${Buffer.from(code).toString(
                "base64"
            )} -->
            `.trim();

            return {
                content,
                isGraphviz: true,
                diagramId,
                diagramName: key,
                dotCode: code,
            };
        } else {
            // For non-GraphViz content, use the original code block approach
            content += `
<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    <ac:parameter ac:name="title">${this.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>
            `.trim();

            return { content, isGraphviz: false };
        }
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

    // NEW: Generate technical files for a specific section
    generateTechnicalFilesForSection(sectionName, sectionTechnicalData) {
        console.log(
            `📎 Generating technical files for section: ${sectionName}`
        );
        console.log(
            `📎 Technical data received:`,
            JSON.stringify(sectionTechnicalData, null, 2)
        );

        if (
            !sectionTechnicalData ||
            !sectionTechnicalData.files ||
            !Array.isArray(sectionTechnicalData.files)
        ) {
            console.log(
                `⚠️ No files found in technical data for section: ${sectionName}`
            );
            return "";
        }

        let content = "";

        sectionTechnicalData.files.forEach((file, index) => {
            console.log(
                `📄 Processing file ${index + 1}: ${file.name}, type: ${
                    file.fileType
                }`
            );

            if (file.fileType === "csv" && file.tableData) {
                console.log("🔍 CSV tableData structure:", {
                    hasHeaders: !!file.tableData.headers,
                    headersLength: file.tableData.headers?.length || 0,
                    hasRows: !!file.tableData.rows,
                    rowsLength: file.tableData.rows?.length || 0,
                    headers: file.tableData.headers,
                    firstRow: file.tableData.rows?.[0],
                });

                // Generate table manually with modern, compact styling
                if (
                    file.tableData.headers &&
                    Array.isArray(file.tableData.headers) &&
                    file.tableData.rows &&
                    Array.isArray(file.tableData.rows)
                ) {
                    content += `<table class="confluenceTable" style="max-width: 100%; border-collapse: collapse; margin: 10px 0;">
<colgroup>`;

                    // Add column definitions for better layout control
                    file.tableData.headers.forEach(() => {
                        content += `<col style="width: ${Math.floor(
                            100 / file.tableData.headers.length
                        )}%;" />`;
                    });

                    content += `</colgroup>
<tbody>
`;

                    // Add headers
                    content += "<tr>";
                    file.tableData.headers.forEach((header) => {
                        content += `<th class="confluenceTh" style="padding: 8px; font-size: 11px; text-align: left;">${this.escapeHtml(
                            String(header)
                        )}</th>`;
                    });
                    content += "</tr>\n";

                    // Add data rows (limit to first 10 rows for compactness)
                    const rowsToShow = file.tableData.rows.slice(0, 10);
                    rowsToShow.forEach((row, rowIndex) => {
                        content += "<tr>";
                        file.tableData.headers.forEach((header) => {
                            let cellValue = "";

                            // Handle different row formats
                            if (typeof row === "object" && row !== null) {
                                cellValue = row[header] || "";
                            } else if (Array.isArray(row)) {
                                const headerIndex =
                                    file.tableData.headers.indexOf(header);
                                cellValue = row[headerIndex] || "";
                            } else {
                                cellValue = "";
                            }

                            // Truncate long cell values for better display
                            const displayValue =
                                String(cellValue).length > 30
                                    ? String(cellValue).substring(0, 27) + "..."
                                    : String(cellValue);

                            content += `<td class="confluenceTd" style="padding: 6px; font-size: 10px; border: 1px solid #ddd;">${this.escapeHtml(
                                displayValue
                            )}</td>`;
                        });
                        content += "</tr>\n";
                    });

                    // Add row count info if truncated
                    if (file.tableData.rows.length > 10) {
                        content += `<tr><td colspan="${file.tableData.headers.length}" style="text-align: center; font-style: italic; color: #666; font-size: 9px; padding: 4px; border: 1px solid #ddd;">... showing 10 of ${file.tableData.rows.length} rows</td></tr>\n`;
                    }

                    content += `</tbody>
</table>
`;
                    console.log(
                        `✅ Successfully generated table for ${file.name}`
                    );
                    // Add description in italics and small text
                    if (file.description && file.description.trim()) {
                        content += `<p style="font-style: italic; font-size: 0.9em; color: #666;">${this.escapeHtml(
                            file.description
                        )}</p>\n`;
                    }
                } else {
                    console.log(
                        `❌ Invalid table data structure for ${file.name}`
                    );
                    content += `<p style="color: #999;"><em>Table data format is invalid for ${this.escapeHtml(
                        file.name
                    )}</em></p>\n`;
                }
            } else if (file.fileType === "image") {
                // Add image with proper styling and larger dimensions
                content += `<p><ac:image ac:width="1200"><ri:attachment ri:filename="${this.escapeHtml(
                    file.name
                )}" /></ac:image></p>`;
                content += `\n<p style="text-align: center; font-size: 0.9em; color: #666; font-style: italic;">${this.escapeHtml(
                    file.description || file.name
                )}</p>\n`;

                console.log(
                    `✅ Successfully generated Confluence image macro for ${file.name}`
                );
            } else {
                console.log(
                    `⚠️ Unknown file type: ${file.fileType} for file: ${file.name}`
                );
            }
        });

        console.log(
            `✅ Generated technical attachments content (${content.length} chars)`
        );
        return content;
    }

    // Main content generation with modern Confluence layout structure
    async generateConfluenceContent(brdData) {
        let content = "";
        const graphvizDiagrams = []; // Track GraphViz diagrams for later processing

        // Use modern Confluence layout structure for new editor compatibility
        content += `<ac:layout>
<ac:layout-section ac:type="single">
<ac:layout-cell>
`;

        // Add metadata section
        content += this.generateMetadataSection(brdData);

        // Process generated sections
        const sections = brdData.sections || brdData.generatedContent || {};
        const technicalData = brdData.technicalData || {};
        console.log("🔍 Available sections:", Object.keys(sections));
        console.log("🔍 Available technical data:", Object.keys(technicalData));
        console.log(
            "🔍 Full technical data structure:",
            JSON.stringify(technicalData, null, 2)
        );

        for (const [sectionName, sectionContent] of Object.entries(sections)) {
            console.log(`📝 Processing section: "${sectionName}"`);
            console.log(`📝 Section content type:`, typeof sectionContent);
            const sectionResult = this.generateSmartContent(
                sectionName,
                sectionContent,
                null,
                technicalData
            );

            content += sectionResult.content + "\n";

            // Track GraphViz diagrams for later processing
            if (sectionResult.diagram) {
                console.log(
                    `🎨 Found GraphViz diagram in section: ${sectionName}`
                );
                graphvizDiagrams.push(sectionResult.diagram);
            }
        }

        // Close the layout structure
        content += `
</ac:layout-cell>
</ac:layout-section>
</ac:layout>`;

        console.log(`✅ Generated ${content.length} characters of content`);
        console.log(
            `🎨 Found ${graphvizDiagrams.length} GraphViz diagrams for rendering`
        );

        return {
            content,
            graphvizDiagrams,
        };
    }

    generateMetadataSection(brdData) {
        const detailsTable = brdData.detailsTable || {};

        let content = `<h2>Integration Details</h2>
<table class="confluenceTable">
<colgroup>
<col style="width: 200px;" />
<col />
</colgroup>
<tbody>
`;

        Object.entries(detailsTable).forEach(([key, value]) => {
            if (value && value.toString().trim()) {
                content += `<tr>
<td class="confluenceTd"><strong>${this.escapeHtml(key)}</strong></td>
<td class="confluenceTd">${this.escapeHtml(value.toString())}</td>
</tr>
`;
            }
        });

        content += `</tbody>
</table>
`;
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
            const contentResult = await this.generateConfluenceContent(brdData);
            let finalContent = contentResult.content;

            const pagePayload = {
                type: "page",
                title: pageTitle,
                space: { key: this.spaceKey },
                body: {
                    storage: {
                        value: finalContent,
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

            console.log("✅ New Confluence page created successfully");
            console.log(
                `🔗 Page URL: ${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`
            );
            console.log(`📋 Page ID stored internally: ${this.currentPageId}`);

            // Upload image attachments after page creation
            let imageUploadResult = null;
            if (brdData.technicalData) {
                console.log("📎 Starting image attachment upload...");
                imageUploadResult = await this.uploadImageAttachments(
                    this.currentPageId,
                    brdData
                );

                if (
                    imageUploadResult.uploaded &&
                    imageUploadResult.uploaded.length > 0
                ) {
                    console.log(
                        `✅ Successfully uploaded ${imageUploadResult.uploaded.length} image attachments`
                    );
                }
                if (
                    imageUploadResult.failed &&
                    imageUploadResult.failed.length > 0
                ) {
                    console.log(
                        `⚠️ Failed to upload ${imageUploadResult.failed.length} image attachments`
                    );
                }
            }

            // Process GraphViz diagrams
            let graphvizUploadResult = null;
            if (
                contentResult.graphvizDiagrams &&
                contentResult.graphvizDiagrams.length > 0
            ) {
                console.log(
                    `🎨 Processing ${contentResult.graphvizDiagrams.length} GraphViz diagrams...`
                );
                graphvizUploadResult = await this.processGraphvizDiagrams(
                    this.currentPageId,
                    contentResult.graphvizDiagrams
                );

                // Update page content with rendered diagram images
                if (
                    graphvizUploadResult.success &&
                    graphvizUploadResult.diagrams.length > 0
                ) {
                    console.log(
                        `🔄 Updating page content with rendered GraphViz diagrams...`
                    );
                    finalContent = await this.replaceGraphvizPlaceholders(
                        finalContent,
                        graphvizUploadResult.diagrams
                    );

                    // Update the page with new content containing image references
                    const updatePayload = {
                        version: { number: this.currentPageVersion + 1 },
                        title: this.currentPageTitle,
                        type: "page",
                        body: {
                            storage: {
                                value: finalContent,
                                representation: "storage",
                            },
                        },
                    };

                    const updateResponse = await this.client.put(
                        `/content/${this.currentPageId}`,
                        updatePayload
                    );
                    this.currentPageVersion =
                        updateResponse.data.version.number;

                    console.log("✅ Page updated with GraphViz diagram images");
                }
            }

            // Add to history
            this.pageHistory.push({
                id: this.currentPageId,
                title: this.currentPageTitle,
                version: this.currentPageVersion,
                createdAt: new Date().toISOString(),
                url: `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`,
                imageUpload: imageUploadResult,
                graphvizUpload: graphvizUploadResult,
            });

            const pageUrl = `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`;

            return {
                success: true,
                pageId: this.currentPageId,
                pageTitle: this.currentPageTitle,
                pageUrl: pageUrl,
                spaceKey: this.spaceKey,
                version: this.currentPageVersion,
                operation: "create",
                imageUpload: imageUploadResult,
                graphvizUpload: graphvizUploadResult,
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
            const contentResult = await this.generateConfluenceContent(brdData);
            let finalContent = contentResult.content;

            const updatePayload = {
                version: { number: currentVersion + 1 },
                title: this.currentPageTitle,
                type: "page",
                body: {
                    storage: {
                        value: finalContent,
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

            console.log("✅ Page updated successfully");
            console.log(
                `🔗 Page URL: ${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`
            );

            // Upload image attachments after page update
            let imageUploadResult = null;
            if (brdData.technicalData) {
                console.log(
                    "📎 Starting image attachment upload after update..."
                );
                imageUploadResult = await this.uploadImageAttachments(
                    this.currentPageId,
                    brdData
                );

                if (
                    imageUploadResult.uploaded &&
                    imageUploadResult.uploaded.length > 0
                ) {
                    console.log(
                        `✅ Successfully uploaded ${imageUploadResult.uploaded.length} image attachments`
                    );
                }
                if (
                    imageUploadResult.failed &&
                    imageUploadResult.failed.length > 0
                ) {
                    console.log(
                        `⚠️ Failed to upload ${imageUploadResult.failed.length} image attachments`
                    );
                }
            }

            // Process GraphViz diagrams
            let graphvizUploadResult = null;
            if (
                contentResult.graphvizDiagrams &&
                contentResult.graphvizDiagrams.length > 0
            ) {
                console.log(
                    `🎨 Processing ${contentResult.graphvizDiagrams.length} GraphViz diagrams...`
                );
                graphvizUploadResult = await this.processGraphvizDiagrams(
                    this.currentPageId,
                    contentResult.graphvizDiagrams
                );

                // Update page content with rendered diagram images
                if (
                    graphvizUploadResult.success &&
                    graphvizUploadResult.diagrams.length > 0
                ) {
                    console.log(
                        `🔄 Updating page content with rendered GraphViz diagrams...`
                    );
                    finalContent = await this.replaceGraphvizPlaceholders(
                        finalContent,
                        graphvizUploadResult.diagrams
                    );

                    // Update the page again with new content containing image references
                    const secondUpdatePayload = {
                        version: { number: this.currentPageVersion + 1 },
                        title: this.currentPageTitle,
                        type: "page",
                        body: {
                            storage: {
                                value: finalContent,
                                representation: "storage",
                            },
                        },
                    };

                    const secondUpdateResponse = await this.client.put(
                        `/content/${this.currentPageId}`,
                        secondUpdatePayload
                    );
                    this.currentPageVersion =
                        secondUpdateResponse.data.version.number;

                    console.log(
                        "✅ Page updated again with GraphViz diagram images"
                    );
                }
            }

            const pageUrl = `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`;

            return {
                success: true,
                pageId: this.currentPageId,
                pageTitle: this.currentPageTitle,
                pageUrl: pageUrl,
                version: this.currentPageVersion,
                previousVersion: currentVersion,
                operation: "update",
                imageUpload: imageUploadResult,
                graphvizUpload: graphvizUploadResult,
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

    // NEW: Upload image attachments to Confluence page
    async uploadImageAttachments(pageId, brdData) {
        if (!pageId || !brdData.technicalData) {
            console.log("⚠️ No page ID or technical data to upload images");
            return { success: true, uploaded: [] };
        }

        const uploadedFiles = [];
        const failedUploads = [];

        try {
            console.log(`📎 Uploading image attachments to page: ${pageId}`);

            // First, verify the page exists
            try {
                const pageCheck = await this.client.get(`/content/${pageId}`);
                console.log(
                    `✅ Page exists: ${pageCheck.data.title} (ID: ${pageId})`
                );
            } catch (pageError) {
                console.error(
                    `❌ Page verification failed:`,
                    pageError.response?.data || pageError.message
                );
                return {
                    success: false,
                    error: `Page ${pageId} not found or not accessible`,
                    uploaded: [],
                    failed: [],
                };
            }

            // Collect all image files from technical data
            const imageFiles = [];
            Object.entries(brdData.technicalData).forEach(
                ([sectionName, sectionData]) => {
                    if (
                        sectionData &&
                        sectionData.files &&
                        Array.isArray(sectionData.files)
                    ) {
                        sectionData.files.forEach((file) => {
                            if (file.fileType === "image" && file.name) {
                                imageFiles.push({
                                    ...file,
                                    sectionName,
                                });
                            }
                        });
                    }
                }
            );

            console.log(`📎 Found ${imageFiles.length} image files to upload`);

            if (imageFiles.length === 0) {
                return {
                    success: true,
                    uploaded: [],
                    message: "No images to upload",
                };
            }

            // Upload each image file
            for (const imageFile of imageFiles) {
                try {
                    console.log(`📤 Uploading image: ${imageFile.name}`);

                    // Create form data for the upload
                    const formData = new FormData();

                    // Handle different types of image data
                    if (imageFile.data && typeof imageFile.data === "string") {
                        // Base64 encoded image data
                        const base64Data = imageFile.data.includes(",")
                            ? imageFile.data.split(",")[1]
                            : imageFile.data;

                        const buffer = Buffer.from(base64Data, "base64");
                        formData.append("file", buffer, {
                            filename: imageFile.name,
                            contentType: imageFile.type || "image/jpeg",
                        });
                    } else if (
                        imageFile.path &&
                        fs.existsSync(imageFile.path)
                    ) {
                        // File path on disk
                        const fileStream = fs.createReadStream(imageFile.path);
                        formData.append("file", fileStream, {
                            filename: imageFile.name,
                            contentType: imageFile.type || "image/jpeg",
                        });
                    } else {
                        console.log(
                            `⚠️ No valid image data found for: ${imageFile.name}`
                        );
                        failedUploads.push({
                            name: imageFile.name,
                            error: "No valid image data found",
                        });
                        continue;
                    }

                    // Use the correct API endpoint path relative to the client baseURL
                    const uploadPath = `/content/${pageId}/child/attachment`;
                    console.log(`🔗 Upload path: ${uploadPath}`);
                    console.log(
                        `🔗 Full URL: ${this.client.defaults.baseURL}${uploadPath}`
                    );

                    // Create a custom request using the same auth but with form-data headers
                    const uploadResponse = await axios.post(
                        `${this.client.defaults.baseURL}${uploadPath}`,
                        formData,
                        {
                            headers: {
                                ...formData.getHeaders(),
                                "X-Atlassian-Token": "nocheck",
                            },
                            auth: {
                                username: this.username,
                                password: this.apiToken,
                            },
                            timeout: 60000, // Longer timeout for file uploads
                        }
                    );

                    console.log(
                        `📤 Upload response status: ${uploadResponse.status}`
                    );
                    console.log(
                        `📤 Upload response data:`,
                        uploadResponse.data
                    );

                    if (
                        uploadResponse.status === 200 ||
                        uploadResponse.status === 201
                    ) {
                        console.log(
                            `✅ Successfully uploaded: ${imageFile.name}`
                        );
                        // Handle both single attachment and array responses
                        const attachmentData = Array.isArray(
                            uploadResponse.data.results
                        )
                            ? uploadResponse.data.results[0]
                            : uploadResponse.data;

                        uploadedFiles.push({
                            name: imageFile.name,
                            attachmentId: attachmentData?.id,
                            section: imageFile.sectionName,
                            url: attachmentData?.url,
                        });
                    } else {
                        console.log(
                            `❌ Failed to upload ${imageFile.name}: ${uploadResponse.status}`
                        );
                        failedUploads.push({
                            name: imageFile.name,
                            error: `HTTP ${uploadResponse.status}`,
                        });
                    }
                } catch (uploadError) {
                    console.error(
                        `❌ Error uploading ${imageFile.name}:`,
                        uploadError.message
                    );
                    console.error(`❌ Upload error details:`, {
                        status: uploadError.response?.status,
                        statusText: uploadError.response?.statusText,
                        data: uploadError.response?.data,
                        url: uploadError.config?.url,
                        baseURL: uploadError.config?.baseURL,
                    });
                    failedUploads.push({
                        name: imageFile.name,
                        error: `${uploadError.response?.status || "Unknown"}: ${
                            uploadError.message
                        }`,
                    });
                }
            }

            const result = {
                success: failedUploads.length === 0,
                uploaded: uploadedFiles,
                failed: failedUploads,
                message: `Uploaded ${uploadedFiles.length}/${imageFiles.length} images successfully`,
            };

            if (failedUploads.length > 0) {
                console.log(
                    `⚠️ Some image uploads failed: ${failedUploads.length}/${imageFiles.length}`
                );
            } else {
                console.log(
                    `✅ All images uploaded successfully: ${uploadedFiles.length}`
                );
            }

            return result;
        } catch (error) {
            console.error("❌ Error in uploadImageAttachments:", error.message);
            return {
                success: false,
                error: error.message,
                uploaded: uploadedFiles,
                failed: failedUploads,
            };
        }
    }

    // NEW: Render GraphViz DOT code to image
    async renderGraphvizToImage(dotCode, filename) {
        try {
            console.log(`🎨 Rendering GraphViz diagram: ${filename}`);
            console.log(`📝 DOT code length: ${dotCode.length} characters`);

            // Initialize GraphViz renderer
            const graphviz = await Graphviz.load();

            // Render DOT code to SVG with smaller dimensions for better quality
            const svgResult = graphviz.dot(dotCode, "svg");
            console.log(
                `✅ SVG generated successfully (${svgResult.length} chars)`
            );

            // Convert SVG to PNG using Sharp with standardized larger dimensions
            const sharp = require("sharp");
            const pngBuffer = await sharp(Buffer.from(svgResult))
                .png({
                    quality: 85,
                    compressionLevel: 6,
                })
                .resize(800, 600, {
                    fit: "inside",
                    withoutEnlargement: true,
                    kernel: sharp.kernel.lanczos3,
                })
                .toBuffer();

            console.log(`✅ PNG image generated: ${pngBuffer.length} bytes`);

            return {
                success: true,
                buffer: pngBuffer,
                format: "png",
                size: pngBuffer.length,
            };
        } catch (error) {
            console.error(
                `❌ Error rendering GraphViz diagram:`,
                error.message
            );
            return {
                success: false,
                error: error.message,
            };
        }
    }

    // NEW: Upload GraphViz diagram as image attachment
    async uploadGraphvizDiagram(pageId, dotCode, diagramName) {
        try {
            console.log(`📊 Processing GraphViz diagram: ${diagramName}`);

            // Generate a filename for the diagram
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `${diagramName.replace(
                /[^a-zA-Z0-9]/g,
                "_"
            )}_${timestamp}.png`;

            // Render the diagram to image
            const renderResult = await this.renderGraphvizToImage(
                dotCode,
                filename
            );

            if (!renderResult.success) {
                console.error(
                    `❌ Failed to render diagram: ${renderResult.error}`
                );
                return {
                    success: false,
                    error: `Failed to render diagram: ${renderResult.error}`,
                };
            }

            // Upload the image as attachment
            try {
                const formData = new FormData();
                formData.append("file", renderResult.buffer, {
                    filename: filename,
                    contentType: "image/png",
                });

                const uploadPath = `/content/${pageId}/child/attachment`;
                console.log(
                    `🔗 Uploading diagram to: ${this.client.defaults.baseURL}${uploadPath}`
                );

                const uploadResponse = await axios.post(
                    `${this.client.defaults.baseURL}${uploadPath}`,
                    formData,
                    {
                        headers: {
                            ...formData.getHeaders(),
                            "X-Atlassian-Token": "nocheck",
                        },
                        auth: {
                            username: this.username,
                            password: this.apiToken,
                        },
                        timeout: 60000,
                    }
                );

                if (
                    uploadResponse.status === 200 ||
                    uploadResponse.status === 201
                ) {
                    const attachment = Array.isArray(
                        uploadResponse.data.results
                    )
                        ? uploadResponse.data.results[0]
                        : uploadResponse.data;

                    console.log(
                        `✅ GraphViz diagram uploaded successfully: ${filename}`
                    );
                    return {
                        success: true,
                        filename: filename,
                        attachmentId: attachment?.id,
                        url: attachment?.url,
                        size: renderResult.size,
                    };
                } else {
                    console.error(
                        `❌ Upload failed with status: ${uploadResponse.status}`
                    );
                    return {
                        success: false,
                        error: `HTTP ${uploadResponse.status}`,
                    };
                }
            } catch (uploadError) {
                console.error(
                    `❌ Error uploading diagram:`,
                    uploadError.message
                );
                return {
                    success: false,
                    error: `Upload error: ${uploadError.message}`,
                };
            }
        } catch (error) {
            console.error(`❌ Error in uploadGraphvizDiagram:`, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    // NEW: Process GraphViz diagrams
    async processGraphvizDiagrams(pageId, diagrams) {
        const processedDiagrams = [];
        const failedDiagrams = [];

        for (const diagram of diagrams) {
            try {
                console.log(
                    `🎨 Processing GraphViz diagram: ${diagram.diagramName}`
                );
                const uploadResult = await this.uploadGraphvizDiagram(
                    pageId,
                    diagram.dotCode,
                    diagram.diagramName
                );

                if (uploadResult.success) {
                    processedDiagrams.push({
                        ...uploadResult,
                        diagramId: diagram.diagramId,
                        diagramName: diagram.diagramName,
                        dotCode: diagram.dotCode,
                    });
                } else {
                    failedDiagrams.push({
                        ...uploadResult,
                        diagramName: diagram.diagramName,
                    });
                }
            } catch (error) {
                console.error(
                    `❌ Error processing diagram ${diagram.diagramName}:`,
                    error.message
                );
                failedDiagrams.push({
                    diagramName: diagram.diagramName,
                    error: error.message,
                });
            }
        }

        return {
            success: failedDiagrams.length === 0,
            diagrams: processedDiagrams,
            errors: failedDiagrams,
        };
    }

    // NEW: Replace GraphViz placeholders with rendered diagram images
    async replaceGraphvizPlaceholders(content, diagrams) {
        let updatedContent = content;

        for (const diagram of diagrams) {
            try {
                // Find and replace the placeholder comment with the actual image
                const diagramId = diagram.diagramId;
                const placeholderPattern = `<!-- GRAPHVIZ_PLACEHOLDER_${diagramId}:[^>]*-->`;
                const regex = new RegExp(placeholderPattern, "g");

                // Create the modern Confluence image macro for the uploaded diagram
                const imageContent = `
<p style="text-align: center;">
<ac:image ac:width="1200">
    <ri:attachment ri:filename="${diagram.filename}" />
</ac:image>
</p>
<p style="text-align: center; font-size: 0.9em; color: #666; font-style: italic;">
${diagram.diagramName}
</p>`;

                // Replace the placeholder comment
                updatedContent = updatedContent.replace(
                    regex,
                    imageContent.trim()
                );

                console.log(
                    `✅ Replaced GraphViz placeholder for: ${diagram.diagramName}`
                );
            } catch (error) {
                console.error(
                    `❌ Error replacing placeholder for ${diagram.diagramName}:`,
                    error.message
                );
            }
        }

        return updatedContent;
    }
}

module.exports = ConfluenceGenerator;
