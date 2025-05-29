const HtmlUtils = require('../utils/HtmlUtils');
const ContentTypeDetector = require('../utils/ContentTypeDetector');

/**
 * Generates HTML content for list data
 */
class ListContentGenerator {
    /**
     * Generate list content
     * @param {string} key - Section key
     * @param {*} value - Content value
     * @returns {string} - Generated HTML list content
     */
    static generate(key, value) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n<ul>\n`;

        const listData = ContentTypeDetector.extractContent(value);

        if (Array.isArray(listData)) {
            content += this.generateArrayList(listData);
        } else if (typeof listData === "string") {
            content += this.generateStringList(listData);
        }

        content += "</ul>\n";
        return content;
    }

    /**
     * Generate list from array data
     * @param {Array} listData - Array of list items
     * @returns {string} - HTML list items
     */
    static generateArrayList(listData) {
        let content = "";
        listData.forEach((item) => {
            content += `<li>${HtmlUtils.escapeHtml(String(item))}</li>\n`;
        });
        return content;
    }

    /**
     * Generate list from string with bullet points
     * @param {string} listData - String with bullet points
     * @returns {string} - HTML list items
     */
    static generateStringList(listData) {
        let content = "";
        const items = listData.split("\n").filter((line) => line.trim());
        
        items.forEach((item) => {
            const cleaned = item.replace(/^[*\-+]\s*/, "").trim();
            if (cleaned) {
                content += `<li>${HtmlUtils.escapeHtml(cleaned)}</li>\n`;
            }
        });
        
        return content;
    }
}

module.exports = ListContentGenerator; 