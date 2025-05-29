const HtmlUtils = require('../utils/HtmlUtils');
const ContentTypeDetector = require('../utils/ContentTypeDetector');

/**
 * Generates HTML content for table data
 */
class TableContentGenerator {
    /**
     * Generate table content
     * @param {string} key - Section key
     * @param {*} value - Content value
     * @param {Array} customHeaders - Optional custom headers
     * @returns {string} - Generated HTML table content
     */
    static generate(key, value, customHeaders = null) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;

        // Extract table data from AI objects
        const metadata = ContentTypeDetector.extractMetadata(value);
        let tableData = ContentTypeDetector.extractContent(value);
        let headers = customHeaders || metadata.headers;

        // Handle AI-generated table structure
        if (metadata.headers && metadata.data) {
            return this.generateAITable(key, metadata.headers, metadata.data);
        }

        // Handle array data with headers
        if (Array.isArray(tableData) && tableData.length > 0) {
            if (headers && Array.isArray(headers)) {
                return content + this.generateTableWithHeaders(headers, tableData);
            } else if (typeof tableData[0] === "object" && !Array.isArray(tableData[0])) {
                // Array of objects - use object keys as headers
                const objectHeaders = Object.keys(tableData[0]);
                return content + this.generateTableWithHeaders(objectHeaders, tableData);
            }
        }

        return content;
    }

    /**
     * Generate table from AI structure with headers and data
     * @param {string} key - Section key
     * @param {Array} headers - Table headers
     * @param {Array} data - Table data
     * @returns {string} - Generated HTML table
     */
    static generateAITable(key, headers, data) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;
        
        content += `<table class="confluenceTable">
<tbody>
`;

        // Headers
        content += "<tr>";
        headers.forEach((header) => {
            content += `<th class="confluenceTh">${HtmlUtils.escapeHtml(header)}</th>`;
        });
        content += "</tr>\n";

        // Data rows
        if (Array.isArray(data)) {
            data.forEach((row) => {
                content += "<tr>";
                if (Array.isArray(row)) {
                    row.forEach((cell) => {
                        content += `<td class="confluenceTd">${HtmlUtils.escapeHtml(String(cell))}</td>`;
                    });
                } else if (typeof row === "object") {
                    headers.forEach((header) => {
                        const cellValue = row[header] || "";
                        content += `<td class="confluenceTd">${HtmlUtils.escapeHtml(String(cellValue))}</td>`;
                    });
                }
                content += "</tr>\n";
            });
        }

        content += "</tbody>\n</table>\n";
        return content;
    }

    /**
     * Generate table with provided headers
     * @param {Array} headers - Table headers
     * @param {Array} tableData - Table data
     * @returns {string} - Generated HTML table
     */
    static generateTableWithHeaders(headers, tableData) {
        let content = `<table class="confluenceTable">
<tbody>
`;

        // Headers
        content += "<tr>";
        headers.forEach((header) => {
            content += `<th class="confluenceTh">${HtmlUtils.escapeHtml(header)}</th>`;
        });
        content += "</tr>\n";

        // Data rows
        tableData.forEach((row) => {
            content += "<tr>";
            if (typeof row === "object" && !Array.isArray(row)) {
                headers.forEach((header) => {
                    const cellValue = row[header] || "";
                    content += `<td class="confluenceTd">${HtmlUtils.escapeHtml(String(cellValue))}</td>`;
                });
            } else if (Array.isArray(row)) {
                row.forEach((cell) => {
                    content += `<td class="confluenceTd">${HtmlUtils.escapeHtml(String(cell))}</td>`;
                });
            }
            content += "</tr>\n";
        });

        content += "</tbody>\n</table>\n";
        return content;
    }

    /**
     * Generate compact table for technical files
     * @param {Array} headers - Table headers
     * @param {Array} rows - Table rows
     * @param {Object} options - Display options
     * @returns {string} - Generated compact table
     */
    static generateCompactTable(headers, rows, options = {}) {
        const { maxRows = 10, title = "" } = options;

        if (!headers || !Array.isArray(headers) || !rows || !Array.isArray(rows)) {
            return `<p style="color: #999;"><em>Invalid table data${title ? ` for ${HtmlUtils.escapeHtml(title)}` : ''}</em></p>\n`;
        }

        const rowsToShow = rows.slice(0, maxRows);
        
        return HtmlUtils.createConfluenceTable(headers, rowsToShow, { 
            maxWidth: "100%", 
            compact: true 
        }) + (rows.length > maxRows ? 
            `<p style="text-align: center; font-style: italic; color: #666; font-size: 9px;">... showing ${maxRows} of ${rows.length} rows</p>\n` : 
            '');
    }
}

module.exports = TableContentGenerator; 