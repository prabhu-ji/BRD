const HtmlUtils = require("./HtmlUtils");
const Logger = require("./Logger");

/**
 * Orchestrates content generation and page building workflow
 * Extracted from ConfluenceGenerator to follow Single Responsibility Principle
 */
class PageContentBuilder {
    constructor() {
        // Remove the problematic module dependencies for now
    }

    /**
     * Generate complete Confluence content from BRD data
     * @param {Object} brdData - BRD data
     * @returns {Promise<Object>} Generated content result
     */
    async generateConfluenceContent(brdData) {
        let content = "";
        const graphvizDiagrams = [];

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

        Logger.debug("Available sections:", Object.keys(sections));
        Logger.debug("Available technical data:", Object.keys(technicalData));

        for (const [sectionName, sectionContent] of Object.entries(sections)) {
            Logger.contentProcessing(sectionName, typeof sectionContent);

            const sectionResult = this.generateSmartContent(
                sectionName,
                sectionContent,
                null,
                technicalData
            );

            content += sectionResult.content + "\n";

            // Track GraphViz diagrams for later processing
            if (sectionResult.diagram) {
                Logger.graphvizProcessing(
                    `Found GraphViz diagram in section: ${sectionName}`
                );
                graphvizDiagrams.push(sectionResult.diagram);
            }
        }

        // Close the layout structure
        content += `
</ac:layout-cell>
</ac:layout-section>
</ac:layout>`;

        Logger.contentGenerated(content.length, graphvizDiagrams.length);

        return {
            content: content,
            graphvizDiagrams: graphvizDiagrams,
            sectionCount: Object.keys(sections).length,
            hasGraphViz: graphvizDiagrams.length > 0,
        };
    }

    /**
     * Smart content generation with technical data integration - UPDATED FOR MULTI-TYPE SUPPORT
     * @param {string} key - Section key
     * @param {*} value - Section content (can be new multi-type or legacy single-type)
     * @param {string} contentType - Optional content type
     * @param {Object} technicalData - Technical data
     * @returns {Object} Generated content result
     */
    generateSmartContent(key, value, contentType = null, technicalData = null) {
        Logger.contentProcessing(key, typeof value);

        // Handle new multi-type structure from ai-generator.js
        if (this.isMultiTypeStructure(value)) {
            return this.generateMultiTypeContent(key, value, technicalData);
        }

        // Handle legacy single-type structure (backward compatibility)
        const detectedType = contentType || this.detectContentType(key, value);
        let result = "";
        let diagramInfo = null;

        // Route content generation based on detected type
        switch (detectedType) {
            case "content":
                if (value.text) {
                    const textHtml = this.generateTextContentOnly(value.text);
                    result = textHtml;
                } else if (value.textFallback) {
                    result = `<p><em>Content temporarily unavailable - fallback content used</em></p>\n`;
                }
                break;
            case "table":
                result = this.generateTableContent(key, value);
                break;
            case "diagram":
            case "graphviz":
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

        // Add technical data if available
        if (technicalData && Object.keys(technicalData).length > 0) {
            const technicalContent = this.processTechnicalDataForSection(
                key,
                technicalData
            );
            result += technicalContent;
        }

        return {
            content: result,
            diagram: diagramInfo,
        };
    }

    /**
     * Check if value is the new multi-type structure from ai-generator.js
     * @param {*} value - Value to check
     * @returns {boolean} True if multi-type structure
     */
    isMultiTypeStructure(value) {
        return (
            value &&
            typeof value === "object" &&
            value.types &&
            Array.isArray(value.types) &&
            value.content &&
            typeof value.content === "object"
        );
    }

    /**
     * Generate content for new multi-type structure
     * @param {string} key - Section key
     * @param {Object} value - Multi-type value structure
     * @param {Object} technicalData - Technical data
     * @returns {Object} Generated content result
     */
    generateMultiTypeContent(key, value, technicalData = null) {
        Logger.info(
            `Generating multi-type content for ${key} with types: [${value.types.join(
                ", "
            )}]`
        );

        let combinedContent = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;
        let diagramInfo = null;
        const { content } = value;

        // Generate content for each type in order
        for (const type of value.types) {
            switch (type) {
                case "content":
                    if (content.text) {
                        const textHtml = this.generateTextContentOnly(
                            content.text
                        );
                        combinedContent += textHtml;
                    } else if (content.textFallback) {
                        combinedContent += `<p><em>Content temporarily unavailable - fallback content used</em></p>\n`;
                    }
                    break;

                case "image":
                case "diagram":
                    if (content.diagram) {
                        const diagramResult = this.generateDiagramContentOnly(
                            content.diagram
                        );
                        if (diagramResult.isGraphviz) {
                            combinedContent += diagramResult.content;
                            diagramInfo = {
                                diagramId: diagramResult.diagramId,
                                diagramName: diagramResult.diagramName,
                                dotCode: diagramResult.dotCode,
                            };
                        } else {
                            combinedContent += diagramResult.content;
                        }
                    }
                    break;

                case "table":
                    if (content.table) {
                        combinedContent += this.generateTableContentOnly(
                            content.table
                        );
                    }
                    break;

                default:
                    Logger.warn(
                        `Unknown content type: ${type} in section ${key}`
                    );
                    break;
            }
        }

        // Add technical data if available
        if (technicalData && Object.keys(technicalData).length > 0) {
            const technicalContent = this.processTechnicalDataForSection(
                key,
                technicalData
            );
            combinedContent += technicalContent;
        }

        // Log any errors from the multi-type generation
        if (content.textError) {
            Logger.warn(
                `Text generation error in ${key}: ${content.textError}`
            );
        }
        if (content.diagramError) {
            Logger.warn(
                `Diagram generation error in ${key}: ${content.diagramError}`
            );
        }
        if (content.tableError) {
            Logger.warn(
                `Table generation error in ${key}: ${content.tableError}`
            );
        }

        return {
            content: combinedContent,
            diagram: diagramInfo,
        };
    }

    /**
     * Generate text content without header (for multi-type sections)
     * @param {string} textContent - Text content
     * @returns {string} Generated HTML
     */
    generateTextContentOnly(textContent) {
        if (typeof textContent === "string") {
            // Clean up content - remove unwanted dashes and formatting
            let cleanedContent = this.cleanContentFormatting(textContent);

            // Check if content should be formatted as a list
            if (this.shouldFormatAsList(cleanedContent)) {
                return this.formatAsBulletList(cleanedContent);
            } else {
                // Format as paragraphs
                return this.formatAsParagraphs(cleanedContent);
            }
        } else {
            return `<p>${HtmlUtils.escapeHtml(String(textContent))}</p>\n`;
        }
    }

    /**
     * Generate diagram content without header (for multi-type sections)
     * @param {Object} diagramContent - Diagram content object
     * @returns {Object} Generated diagram result
     */
    generateDiagramContentOnly(diagramContent) {
        let code = "";
        let isGraphviz = false;

        if (typeof diagramContent === "object" && diagramContent !== null) {
            code = diagramContent.code || diagramContent.content || "";
            // Check if it's GraphViz content
            if (
                diagramContent.format === "dot" ||
                code.includes("digraph") ||
                code.includes("->")
            ) {
                isGraphviz = true;
            }
        } else if (typeof diagramContent === "string") {
            code = diagramContent;
            if (code.includes("digraph") || code.includes("->")) {
                isGraphviz = true;
            }
        }

        if (isGraphviz) {
            const diagramId = `graphviz_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 8)}`;
            const content = `<!-- GRAPHVIZ_PLACEHOLDER_${diagramId}: ${Buffer.from(
                code
            ).toString("base64")} -->`;

            return {
                content,
                isGraphviz: true,
                diagramId,
                diagramName: "Multi-type Diagram",
                dotCode: code,
            };
        } else {
            const content = `<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">text</ac:parameter>
    <ac:parameter ac:name="title">Diagram</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>`;

            return { content, isGraphviz: false };
        }
    }

    /**
     * Generate table content without header (for multi-type sections)
     * @param {*} tableContent - Table content
     * @returns {string} Generated HTML
     */
    generateTableContentOnly(tableContent) {
        if (typeof tableContent === "string") {
            // If table content is a string, treat it as formatted text
            return this.generateTextContentOnly(tableContent);
        } else if (typeof tableContent === "object" && tableContent !== null) {
            // If it's structured table data, generate table HTML
            if (tableContent.headers && tableContent.data) {
                return this.generateStructuredTable(tableContent);
            } else {
                // If it's some other object, stringify it safely
                return `<p>${HtmlUtils.escapeHtml(
                    JSON.stringify(tableContent, null, 2)
                )}</p>\n`;
            }
        } else {
            return `<p>${HtmlUtils.escapeHtml(String(tableContent))}</p>\n`;
        }
    }

    /**
     * Generate structured table HTML
     * @param {Object} tableData - Table data with headers and rows
     * @returns {string} Generated table HTML
     */
    generateStructuredTable(tableData) {
        if (!tableData.headers || !tableData.data) {
            return `<p style="color: #999;"><em>Invalid table data structure</em></p>\n`;
        }

        let content = `<table class="confluenceTable" style="max-width: 100%; border-collapse: collapse; margin: 10px 0;">
<colgroup>`;

        // Add column definitions
        tableData.headers.forEach(() => {
            content += `<col style="width: ${Math.floor(
                100 / tableData.headers.length
            )}%;" />`;
        });

        content += `</colgroup>
<tbody>
`;

        // Add headers
        content += "<tr>";
        tableData.headers.forEach((header) => {
            content += `<th class="confluenceTh" style="padding: 8px; font-size: 11px; text-align: left;">${HtmlUtils.escapeHtml(
                String(header)
            )}</th>`;
        });
        content += "</tr>\n";

        // Add data rows
        const rowsToShow = Array.isArray(tableData.data)
            ? tableData.data.slice(0, 20)
            : [];
        rowsToShow.forEach((row) => {
            content += "<tr>";
            if (Array.isArray(row)) {
                row.forEach((cell) => {
                    content += `<td class="confluenceTd" style="padding: 8px; font-size: 11px;">${HtmlUtils.escapeHtml(
                        String(cell || "")
                    )}</td>`;
                });
            } else if (typeof row === "object" && row !== null) {
                tableData.headers.forEach((header) => {
                    const cellValue = row[header] || "";
                    content += `<td class="confluenceTd" style="padding: 8px; font-size: 11px;">${HtmlUtils.escapeHtml(
                        String(cellValue)
                    )}</td>`;
                });
            }
            content += "</tr>\n";
        });

        content += `</tbody>
</table>
`;
        return content;
    }

    /**
     * Detect content type for proper routing - ENHANCED FOR MULTI-TYPE SUPPORT
     * @param {string} key - Section key
     * @param {*} value - Section value
     * @returns {string} Detected content type
     */
    detectContentType(key, value) {
        if (!value) return "empty";

        // Handle new multi-type structure (this should be caught by isMultiTypeStructure first)
        if (this.isMultiTypeStructure(value)) {
            return "multi-type";
        }

        // Handle legacy AI-generated objects with type field
        if (typeof value === "object" && value !== null && value.type) {
            // Check if this is a single-type section that has both legacy and multi-type fields
            if (
                value.types &&
                Array.isArray(value.types) &&
                value.types.length === 1
            ) {
                // This is a single-type section with backward compatibility
                // Process as multi-type to get the full content
                return "multi-type";
            }

            // Pure legacy single-type structure from old ai-generator
            if (
                value.type === "content" &&
                (value.content || value.legacyContent)
            ) {
                return "content";
            } else if (
                value.type === "graphviz" &&
                (value.code || value.content)
            ) {
                return "graphviz";
            } else {
                return value.type;
            }
        }

        // Handle legacy backward compatibility structures
        if (typeof value === "object" && value !== null) {
            // Check for legacy graphviz structure
            if (
                value.code &&
                (value.format === "dot" ||
                    String(value.code).includes("digraph") ||
                    String(value.code).includes("->"))
            ) {
                return "graphviz";
            }

            // Check for table data structure
            if (value.headers && value.data) return "table";

            // Check for other object structures
            if (value.content && typeof value.content === "string") {
                return "content";
            }

            return "object";
        }

        if (typeof value === "string") {
            // Check for GraphViz DOT notation
            if (
                value.includes("digraph") ||
                value.includes("->") ||
                value.includes("graph")
            ) {
                return "graphviz";
            }

            // Check for list formatting
            if (
                value.includes("*   ") ||
                value.includes("\n*") ||
                value.includes("• ")
            ) {
                return "content";
            }

            return value.length > 100 ? "content" : "short_content";
        }

        if (Array.isArray(value)) {
            if (value.length === 0) return "empty";
            return this.isTableData(value) ? "table" : "list";
        }

        return "unknown";
    }

    /**
     * Process technical data for a specific section
     * @param {string} sectionKey - Section key
     * @param {Object} technicalData - Technical data
     * @returns {string} Generated technical content
     */
    processTechnicalDataForSection(sectionKey, technicalData) {
        Logger.info(`Processing technical data for section: "${sectionKey}"`);

        // Try exact match first
        let sectionTechnicalData = technicalData[sectionKey];

        // If no exact match, try flexible matching
        if (!sectionTechnicalData) {
            const normalizedKey = this.normalizeKeyForMatching(sectionKey);

            for (const [techKey, techData] of Object.entries(technicalData)) {
                const normalizedTechKey = this.normalizeKeyForMatching(techKey);
                if (normalizedKey === normalizedTechKey) {
                    Logger.info(
                        `Found matching technical data: "${sectionKey}" matches "${techKey}"`
                    );
                    sectionTechnicalData = techData;
                    break;
                }
            }
        }

        if (!sectionTechnicalData) {
            return "";
        }

        return this.generateTechnicalFilesForSection(
            sectionKey,
            sectionTechnicalData
        );
    }

    /**
     * Generate technical files content for a section
     * @param {string} sectionName - Section name
     * @param {Object} sectionTechnicalData - Technical data for the section
     * @returns {string} Generated content
     */
    generateTechnicalFilesForSection(sectionName, sectionTechnicalData) {
        if (
            !sectionTechnicalData?.files ||
            !Array.isArray(sectionTechnicalData.files)
        ) {
            return "";
        }

        let content = "";
        sectionTechnicalData.files.forEach((file) => {
            if (file.fileType === "csv") {
                if (file.isAttachment) {
                    // Generate attachment link for CSV files marked as attachments
                    content += this.generateCSVAttachmentLink(file);
                } else {
                    // Generate embedded table for CSV files marked as embedded content
                    content += this.generateCSVTable(file);
                }
            } else if (file.fileType === "image") {
                content += this.generateImageContent(file);
            }
        });

        return content;
    }

    /**
     * Generate CSV attachment link content
     * @param {Object} file - CSV file object
     * @returns {string} Generated attachment link HTML
     */
    generateCSVAttachmentLink(file) {
        let content = `<p><ac:link><ri:attachment ri:filename="${HtmlUtils.escapeHtml(file.name)}" /><ac:plain-text-link-body><![CDATA[${HtmlUtils.escapeHtml(file.name)}]]></ac:plain-text-link-body></ac:link></p>`;

        // Add description if available
        if (file.description && file.description.trim()) {
            content += `<p style="font-style: italic; font-size: 0.9em; color: #666; margin-top: 5px;">${HtmlUtils.escapeHtml(file.description)}</p>\n`;
        }

        return content;
    }

    /**
     * Generate CSV table content
     * @param {Object} file - CSV file object
     * @returns {string} Generated table HTML
     */
    generateCSVTable(file) {
        if (!file.tableData?.headers || !file.tableData?.rows) {
            return `<p style="color: #999;"><em>Table data format is invalid for ${HtmlUtils.escapeHtml(
                file.name
            )}</em></p>\n`;
        }

        let content = `<table class="confluenceTable" style="max-width: 100%; border-collapse: collapse; margin: 10px 0;">
<colgroup>`;

        // Add column definitions
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
            content += `<th class="confluenceTh" style="padding: 8px; font-size: 11px; text-align: left;">${HtmlUtils.escapeHtml(
                String(header)
            )}</th>`;
        });
        content += "</tr>\n";

        // Add data rows (limit to first 10 rows)
        const rowsToShow = file.tableData.rows.slice(0, 10);
        rowsToShow.forEach((row) => {
            content += "<tr>";
            file.tableData.headers.forEach((header) => {
                let cellValue = "";
                if (typeof row === "object" && row !== null) {
                    cellValue = row[header] || "";
                } else if (Array.isArray(row)) {
                    const headerIndex = file.tableData.headers.indexOf(header);
                    cellValue = row[headerIndex] || "";
                }

                const displayValue =
                    String(cellValue).length > 30
                        ? String(cellValue).substring(0, 27) + "..."
                        : String(cellValue);

                content += `<td class="confluenceTd" style="padding: 6px; font-size: 10px; border: 1px solid #ddd;">${HtmlUtils.escapeHtml(
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

        // Add description
        if (file.description?.trim()) {
            content += `<p style="font-style: italic; font-size: 0.9em; color: #666;">${HtmlUtils.escapeHtml(
                file.description
            )}</p>\n`;
        }

        return content;
    }

    /**
     * Generate text content with improved formatting
     * @param {string} key - Section key
     * @param {*} value - Section value
     * @returns {string} Generated text HTML
     */
    generateTextContent(key, value) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;

        let actualContent = value;
        if (typeof value === "object" && value !== null && value.content) {
            actualContent = value.content;
        }

        if (typeof actualContent === "string") {
            // Clean up content - remove unwanted dashes and formatting
            let cleanedContent = this.cleanContentFormatting(actualContent);

            // Check if content should be formatted as a list
            if (this.shouldFormatAsList(cleanedContent)) {
                content += this.formatAsBulletList(cleanedContent);
            } else {
                // Format as paragraphs
                content += this.formatAsParagraphs(cleanedContent);
            }
        } else {
            content += `<p>${HtmlUtils.escapeHtml(
                String(actualContent)
            )}</p>\n`;
        }

        return content;
    }

    /**
     * Clean content formatting by removing unwanted characters and patterns
     * @param {string} content - Raw content
     * @returns {string} Cleaned content
     */
    cleanContentFormatting(content) {
        return (
            content
                // Remove standalone dashes that are not part of lists (not followed by space and content)
                .replace(/^-\s*$/gm, "")
                // Remove multiple consecutive dashes (but preserve single dashes with content)
                .replace(/--+/g, "—")
                // Remove leading dashes only if they're NOT followed by a space and content (i.e., not list items)
                .replace(/^-(?!\s+\S)/gm, "")
                // Clean up excessive whitespace
                .replace(/\n\s*\n\s*\n/g, "\n\n")
                .trim()
        );
    }

    /**
     * Determine if content should be formatted as a list
     * @param {string} content - Content to check
     * @returns {boolean} True if should be formatted as list
     */
    shouldFormatAsList(content) {
        const lines = content.split("\n").filter((line) => line.trim());
        const listIndicators = lines.filter((line) => {
            const trimmed = line.trim();
            return trimmed.match(/^[\*\-•]\s+/) || trimmed.match(/^\d+\.\s+/);
        });

        const nonListLines = lines.filter((line) => {
            const trimmed = line.trim();
            // Exclude list intro lines (ending with :) and actual list items
            return (
                !trimmed.match(/^[\*\-•]\s+/) &&
                !trimmed.match(/^\d+\.\s+/) &&
                !trimmed.endsWith(":")
            );
        });

        // If we have list items and they make up most of the meaningful content, format as list
        // Allow for intro lines and minimal non-list content
        return (
            listIndicators.length > 0 &&
            (listIndicators.length >= nonListLines.length ||
                listIndicators.length > 2)
        );
    }

    /**
     * Format content as bullet list with better mixed-type handling
     * @param {string} content - Content to format
     * @returns {string} Formatted HTML list
     */
    formatAsBulletList(content) {
        const lines = content.split("\n").filter((line) => line.trim());
        let html = "";

        // First pass: separate intro/outro content from list items
        const introLines = [];
        const listItems = [];
        const outroLines = [];
        let foundFirstListItem = false;
        let foundLastListItem = false;

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            const bulletMatch = trimmed.match(/^[\*\-•]\s+(.+)/);
            const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/);

            if (bulletMatch || numberedMatch) {
                if (!foundFirstListItem) foundFirstListItem = true;
                const content = bulletMatch ? bulletMatch[1] : numberedMatch[1];
                const type = bulletMatch ? "bullet" : "numbered";
                listItems.push({ content: content.trim(), type });
            } else if (trimmed) {
                if (!foundFirstListItem) {
                    // Before any list items - intro content
                    introLines.push(trimmed);
                } else {
                    // After list items started - could be outro or break in list
                    // Check if there are more list items ahead
                    const remainingLines = lines.slice(index + 1);
                    const hasMoreListItems = remainingLines.some((line) => {
                        const t = line.trim();
                        return t.match(/^[\*\-•]\s+/) || t.match(/^\d+\.\s+/);
                    });

                    if (!hasMoreListItems) {
                        outroLines.push(trimmed);
                    } else {
                        // This is a break in the list - treat as outro and start new list later
                        outroLines.push(trimmed);
                    }
                }
            }
        });

        // Generate intro content
        introLines.forEach((line) => {
            if (line.endsWith(":")) {
                html += `<p><strong>${HtmlUtils.escapeHtml(
                    line
                )}</strong></p>\n`;
            } else {
                html += `<p>${HtmlUtils.escapeHtml(line)}</p>\n`;
            }
        });

        // Generate the consolidated list
        if (listItems.length > 0) {
            // Determine list type based on majority
            const bulletItems = listItems.filter(
                (item) => item.type === "bullet"
            );
            const numberedItems = listItems.filter(
                (item) => item.type === "numbered"
            );
            const useOrderedList = numberedItems.length > bulletItems.length;
            const listTag = useOrderedList ? "ol" : "ul";

            html += `<${listTag}>\n`;
            listItems.forEach((item) => {
                html += `<li>${HtmlUtils.escapeHtml(item.content)}</li>\n`;
            });
            html += `</${listTag}>\n`;
        }

        // Generate outro content
        outroLines.forEach((line) => {
            html += `<p>${HtmlUtils.escapeHtml(line)}</p>\n`;
        });

        return html;
    }

    /**
     * Format content as paragraphs
     * @param {string} content - Content to format
     * @returns {string} Formatted HTML paragraphs
     */
    formatAsParagraphs(content) {
        let html = "";

        // Split into paragraphs and process each one
        const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());

        paragraphs.forEach((paragraph) => {
            const trimmed = paragraph.trim();
            if (trimmed) {
                // Handle multi-line paragraphs by joining lines with spaces
                const cleanParagraph = trimmed
                    .replace(/\n/g, " ")
                    .replace(/\s+/g, " ");
                html += `<p>${HtmlUtils.escapeHtml(cleanParagraph)}</p>\n`;
            }
        });

        return html;
    }

    /**
     * Generate image content with proper sizing
     * @param {Object} file - Image file object
     * @returns {string} Generated image HTML
     */
    generateImageContent(file) {
        // Use more reasonable image width - 800px instead of 1200px
        let content = `<p style="text-align: center;"><ac:image ac:width="800"><ri:attachment ri:filename="${HtmlUtils.escapeHtml(
            file.name
        )}" /></ac:image></p>`;

        // Add description with better styling
        if (file.description && file.description.trim()) {
            content += `<p style="text-align: center; font-size: 0.9em; color: #666; font-style: italic; margin-top: 5px;">${HtmlUtils.escapeHtml(
                file.description
            )}</p>\n`;
        } else {
            content += `<p style="text-align: center; font-size: 0.9em; color: #666; font-style: italic; margin-top: 5px;">${HtmlUtils.escapeHtml(
                file.name
            )}</p>\n`;
        }

        return content;
    }

    /**
     * Generate list content with improved formatting
     * @param {string} key - Section key
     * @param {*} value - Section value
     * @returns {string} Generated list HTML
     */
    generateListContent(key, value) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;

        let listData = value;
        if (typeof value === "object" && value !== null && value.content) {
            listData = value.content;
        }

        if (Array.isArray(listData)) {
            content += "<ul>\n";
            listData.forEach((item) => {
                // Clean item content to remove unwanted dashes
                let cleanItem = String(item).replace(/^-\s*/, "").trim();
                content += `<li>${HtmlUtils.escapeHtml(cleanItem)}</li>\n`;
            });
            content += "</ul>\n";
        } else if (typeof listData === "string") {
            // Handle string-based lists
            content += this.formatAsBulletList(listData);
        }

        return content;
    }

    /**
     * Generate table content
     * @param {string} key - Section key
     * @param {*} value - Section value
     * @returns {string} Generated table HTML
     */
    generateTableContent(key, value) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;

        if (
            typeof value === "object" &&
            value !== null &&
            value.headers &&
            value.data
        ) {
            content += `<table class="confluenceTable">
<tbody>
`;
            // Headers
            content += "<tr>";
            value.headers.forEach((header) => {
                content += `<th class="confluenceTh">${HtmlUtils.escapeHtml(
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
                            content += `<td class="confluenceTd">${HtmlUtils.escapeHtml(
                                String(cell)
                            )}</td>`;
                        });
                    } else if (typeof row === "object") {
                        value.headers.forEach((header) => {
                            const cellValue = row[header] || "";
                            content += `<td class="confluenceTd">${HtmlUtils.escapeHtml(
                                String(cellValue)
                            )}</td>`;
                        });
                    }
                    content += "</tr>\n";
                });
            }

            content += "</tbody>\n</table>\n";
        }

        return content;
    }

    /**
     * Generate diagram content
     * @param {string} key - Section key
     * @param {*} value - Section value
     * @returns {Object} Generated diagram result
     */
    generateDiagramContent(key, value) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;
        let code = "";
        let isGraphviz = false;

        if (typeof value === "object" && value !== null) {
            code =
                value.content ||
                value.code ||
                value.diagram ||
                value.graphviz ||
                value.dot ||
                "";
            if (
                value.type === "graphviz" ||
                code.includes("digraph") ||
                code.includes("->")
            ) {
                isGraphviz = true;
            }
        } else if (typeof value === "string") {
            code = value;
            if (code.includes("digraph") || code.includes("->")) {
                isGraphviz = true;
            }
        }

        if (isGraphviz) {
            const diagramId = `graphviz_${key.replace(
                /[^a-zA-Z0-9]/g,
                "_"
            )}_${Date.now()}`;
            content += `<!-- GRAPHVIZ_PLACEHOLDER_${diagramId}: ${Buffer.from(
                code
            ).toString("base64")} -->`;

            return {
                content,
                isGraphviz: true,
                diagramId,
                diagramName: key,
                dotCode: code,
            };
        } else {
            content += `<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">text</ac:parameter>
    <ac:parameter ac:name="title">${HtmlUtils.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>`;

            return { content, isGraphviz: false };
        }
    }

    /**
     * Generate code content
     * @param {string} key - Section key
     * @param {*} value - Section value
     * @returns {string} Generated code HTML
     */
    generateCodeContent(key, value) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;
        let code = "";
        let language = "text";

        if (typeof value === "object" && value !== null) {
            code = value.content || value.code || "";
            language = value.language || "text";
        } else if (typeof value === "string") {
            code = value;
        }

        content += `<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    <ac:parameter ac:name="title">${HtmlUtils.escapeHtml(key)}</ac:parameter>
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>`;

        return content;
    }

    /**
     * Check if array represents table data
     * @param {Array} value - Array to check
     * @returns {boolean} True if table data
     */
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

    /**
     * Normalize key for matching
     * @param {string} key - Key to normalize
     * @returns {string} Normalized key
     */
    normalizeKeyForMatching(key) {
        return key
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "");
    }

    /**
     * Generate metadata section from BRD details
     * @param {Object} brdData - BRD data
     * @returns {string} Generated metadata HTML
     */
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
<td class="confluenceTd"><strong>${HtmlUtils.escapeHtml(key)}</strong></td>
<td class="confluenceTd">${HtmlUtils.escapeHtml(value.toString())}</td>
</tr>
`;
            }
        });

        content += `</tbody>
</table>
`;
        return content;
    }

    /**
     * Generate page title from BRD data
     * @param {Object} brdData - BRD data
     * @returns {string} Generated page title
     */
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

    /**
     * Create page payload for Confluence API
     * @param {string} title - Page title
     * @param {string} content - Page content
     * @param {string} spaceKey - Confluence space key
     * @param {string} parentPageId - Optional parent page ID
     * @returns {Object} Page payload for API
     */
    createPagePayload(title, content, spaceKey, parentPageId = null) {
        const pagePayload = {
            type: "page",
            title: title,
            space: { key: spaceKey },
            body: {
                storage: {
                    value: content,
                    representation: "storage",
                },
            },
        };

        if (parentPageId) {
            pagePayload.ancestors = [{ id: parentPageId }];
        }

        return pagePayload;
    }

    /**
     * Create page update payload for Confluence API
     * @param {string} title - Page title
     * @param {string} content - Page content
     * @param {number} versionNumber - Version number
     * @returns {Object} Update payload for API
     */
    createUpdatePayload(title, content, versionNumber) {
        return {
            version: { number: versionNumber },
            title: title,
            type: "page",
            body: {
                storage: {
                    value: content,
                    representation: "storage",
                },
            },
        };
    }

    /**
     * Validate BRD data structure
     * @param {Object} brdData - BRD data to validate
     * @returns {Object} Validation result
     */
    validateBRDData(brdData) {
        const errors = [];
        const warnings = [];

        if (!brdData) {
            errors.push("BRD data is required");
            return { isValid: false, errors, warnings };
        }

        if (!brdData.sections && !brdData.generatedContent) {
            errors.push("BRD data must contain sections or generatedContent");
        }

        if (!brdData.detailsTable) {
            warnings.push(
                "No detailsTable found - metadata section will be minimal"
            );
        }

        const sections = brdData.sections || brdData.generatedContent || {};
        if (Object.keys(sections).length === 0) {
            warnings.push("No sections found to generate content");
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            sectionCount: Object.keys(sections).length,
            hasTechnicalData: !!(
                brdData.technicalData &&
                Object.keys(brdData.technicalData).length > 0
            ),
        };
    }

    /**
     * Estimate content complexity
     * @param {Object} brdData - BRD data
     * @returns {Object} Complexity metrics
     */
    estimateComplexity(brdData) {
        const sections = brdData.sections || brdData.generatedContent || {};
        const technicalData = brdData.technicalData || {};

        let complexity = {
            sectionCount: Object.keys(sections).length,
            technicalDataSections: Object.keys(technicalData).length,
            estimatedGraphVizDiagrams: 0,
            estimatedImages: 0,
            estimatedTables: 0,
        };

        // Estimate content types
        Object.values(sections).forEach((sectionContent) => {
            if (typeof sectionContent === "object" && sectionContent !== null) {
                if (
                    sectionContent.type === "graphviz" ||
                    sectionContent.type === "diagram"
                ) {
                    complexity.estimatedGraphVizDiagrams++;
                } else if (
                    sectionContent.type === "table" ||
                    (sectionContent.headers && sectionContent.data)
                ) {
                    complexity.estimatedTables++;
                }
            }
        });

        // Count technical files
        Object.values(technicalData).forEach((techData) => {
            if (techData.files && Array.isArray(techData.files)) {
                techData.files.forEach((file) => {
                    if (file.fileType === "image") {
                        complexity.estimatedImages++;
                    } else if (file.fileType === "csv") {
                        complexity.estimatedTables++;
                    }
                });
            }
        });

        // Calculate overall complexity score
        complexity.score =
            complexity.sectionCount * 1 +
            complexity.technicalDataSections * 2 +
            complexity.estimatedGraphVizDiagrams * 3 +
            complexity.estimatedImages * 2 +
            complexity.estimatedTables * 1.5;

        complexity.level =
            complexity.score < 10
                ? "simple"
                : complexity.score < 25
                ? "moderate"
                : "complex";

        return complexity;
    }

    /**
     * Log validation and complexity information
     * @param {Object} brdData - BRD data
     */
    logBRDAnalysis(brdData) {
        const validation = this.validateBRDData(brdData);
        const complexity = this.estimateComplexity(brdData);

        Logger.info(
            `BRD Analysis - Sections: ${complexity.sectionCount}, Complexity: ${complexity.level}`
        );

        if (validation.warnings.length > 0) {
            validation.warnings.forEach((warning) => Logger.warn(warning));
        }

        if (complexity.estimatedGraphVizDiagrams > 0) {
            Logger.info(
                `Expected ${complexity.estimatedGraphVizDiagrams} GraphViz diagrams to process`
            );
        }

        if (complexity.estimatedImages > 0) {
            Logger.info(
                `Expected ${complexity.estimatedImages} images to upload`
            );
        }
    }
}

module.exports = PageContentBuilder;
