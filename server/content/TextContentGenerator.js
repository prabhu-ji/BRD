const HtmlUtils = require('../utils/HtmlUtils');
const ContentTypeDetector = require('../utils/ContentTypeDetector');

/**
 * Generates HTML content for text and markdown sections
 */
class TextContentGenerator {
    /**
     * Generate text content with markdown support
     * @param {string} key - Section key
     * @param {*} value - Content value
     * @returns {string} - Generated HTML content
     */
    static generate(key, value) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;

        // Extract content from AI objects
        const actualContent = ContentTypeDetector.extractContent(value);

        if (typeof actualContent === "string") {
            // Convert bullet points to HTML lists with markdown support
            if (actualContent.includes("*") && actualContent.includes("\n")) {
                content += this.generateBulletList(actualContent);
            } else {
                content += this.generateParagraphs(actualContent);
            }
        } else {
            content += `<p>${HtmlUtils.escapeHtml(String(actualContent))}</p>\n`;
        }

        return content;
    }

    /**
     * Generate bullet list from markdown-style text
     * @param {string} text - Text with bullet points
     * @returns {string} - HTML list
     */
    static generateBulletList(text) {
        const lines = text.split("\n").filter((line) => line.trim());
        let content = "";
        let inList = false;

        lines.forEach((line) => {
            const trimmed = line.trim();
            if (trimmed.startsWith("* ")) {
                if (!inList) {
                    content += "<ul>\n";
                    inList = true;
                }
                const bulletContent = trimmed.substring(2).trim(); // Remove "* "
                content += `<li>${HtmlUtils.processMarkdownFormatting(bulletContent)}</li>\n`;
            } else {
                if (inList) {
                    content += "</ul>\n";
                    inList = false;
                }
                if (trimmed) {
                    content += `<p>${HtmlUtils.processMarkdownFormatting(trimmed)}</p>\n`;
                }
            }
        });

        if (inList) {
            content += "</ul>\n";
        }

        return content;
    }

    /**
     * Generate paragraphs with markdown support
     * @param {string} text - Text content
     * @returns {string} - HTML paragraphs
     */
    static generateParagraphs(text) {
        const paragraphs = text.split("\n\n").filter((p) => p.trim());
        let content = "";
        
        paragraphs.forEach((paragraph) => {
            const formattedParagraph = HtmlUtils.processMarkdownFormatting(paragraph.trim());
            content += `<p>${formattedParagraph}</p>\n`;
        });
        
        return content;
    }
}

module.exports = TextContentGenerator; 