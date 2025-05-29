/**
 * HTML and Markdown processing utilities for Confluence content generation
 */
class HtmlUtils {
    /**
     * Escape HTML content safely
     * @param {*} text - Content to escape
     * @returns {string} - Escaped HTML string
     */
    static escapeHtml(text) {
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

    /**
     * Process markdown formatting to HTML
     * @param {string} text - Text with markdown formatting
     * @returns {string} - HTML formatted text
     */
    static processMarkdownFormatting(text) {
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

    /**
     * Create Confluence table structure
     * @param {Array} headers - Table headers
     * @param {Array} rows - Table rows
     * @param {Object} options - Styling options
     * @returns {string} - Confluence table HTML
     */
    static createConfluenceTable(headers, rows, options = {}) {
        const { maxWidth = "100%", compact = false } = options;
        
        let content = `<table class="confluenceTable" style="max-width: ${maxWidth}; border-collapse: collapse; margin: 10px 0;">`;
        
        // Add column definitions for better layout control
        if (headers && headers.length > 0) {
            content += `<colgroup>`;
            headers.forEach(() => {
                content += `<col style="width: ${Math.floor(100 / headers.length)}%;" />`;
            });
            content += `</colgroup>`;
        }
        
        content += `<tbody>`;

        // Add headers
        if (headers && headers.length > 0) {
            content += "<tr>";
            headers.forEach((header) => {
                const cellStyle = compact 
                    ? "padding: 8px; font-size: 11px; text-align: left;"
                    : "padding: 12px; text-align: left;";
                content += `<th class="confluenceTh" style="${cellStyle}">${this.escapeHtml(String(header))}</th>`;
            });
            content += "</tr>\n";
        }

        // Add data rows
        if (rows && rows.length > 0) {
            rows.forEach((row) => {
                content += "<tr>";
                if (Array.isArray(row)) {
                    row.forEach((cell) => {
                        const cellStyle = compact 
                            ? "padding: 6px; font-size: 10px; border: 1px solid #ddd;"
                            : "padding: 8px; border: 1px solid #ddd;";
                        content += `<td class="confluenceTd" style="${cellStyle}">${this.escapeHtml(String(cell))}</td>`;
                    });
                } else if (typeof row === "object" && row !== null && headers) {
                    headers.forEach((header) => {
                        const cellValue = row[header] || "";
                        const cellStyle = compact 
                            ? "padding: 6px; font-size: 10px; border: 1px solid #ddd;"
                            : "padding: 8px; border: 1px solid #ddd;";
                        content += `<td class="confluenceTd" style="${cellStyle}">${this.escapeHtml(String(cellValue))}</td>`;
                    });
                }
                content += "</tr>\n";
            });
        }

        content += `</tbody></table>`;
        return content;
    }

    /**
     * Create Confluence code block
     * @param {string} code - Code content
     * @param {string} language - Programming language
     * @param {string} title - Code block title
     * @returns {string} - Confluence code macro
     */
    static createCodeBlock(code, language = "text", title = "") {
        return `
<ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">${language}</ac:parameter>
    ${title ? `<ac:parameter ac:name="title">${this.escapeHtml(title)}</ac:parameter>` : ''}
    <ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body>
</ac:structured-macro>
        `.trim();
    }

    /**
     * Create Confluence image macro
     * @param {string} filename - Image filename
     * @param {Object} options - Image options
     * @returns {string} - Confluence image macro
     */
    static createImageMacro(filename, options = {}) {
        const { width = "1200", centered = true, caption = "" } = options;
        
        let content = centered ? '<p style="text-align: center;">' : '<p>';
        content += `<ac:image ac:width="${width}"><ri:attachment ri:filename="${this.escapeHtml(filename)}" /></ac:image>`;
        content += '</p>';
        
        if (caption) {
            content += `\n<p style="text-align: center; font-size: 0.9em; color: #666; font-style: italic;">${this.escapeHtml(caption)}</p>`;
        }
        
        return content;
    }
}

module.exports = HtmlUtils; 