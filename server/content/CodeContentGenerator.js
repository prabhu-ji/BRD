const HtmlUtils = require("../utils/HtmlUtils");
const ContentTypeDetector = require("../utils/ContentTypeDetector");

/**
 * Generates HTML content for code blocks
 */
class CodeContentGenerator {
    /**
     * Generate code content
     * @param {string} key - Section key
     * @param {*} value - Content value
     * @returns {string} - Generated HTML code content
     */
    static generate(key, value) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;

        let code = "";
        let language = "text";

        // Extract code and metadata
        const extractedData = this.extractCodeData(value);
        code = extractedData.code;
        language = extractedData.language;

        content += HtmlUtils.createCodeBlock(code, language, key);
        return content;
    }

    /**
     * Extract code data from various input formats
     * @param {*} value - Input value
     * @returns {Object} - Extracted code and language
     */
    static extractCodeData(value) {
        let code = "";
        let language = "text";

        if (typeof value === "object" && value !== null) {
            const metadata = ContentTypeDetector.extractMetadata(value);
            code = ContentTypeDetector.extractContent(value);
            language = metadata.language || "text";
        } else if (typeof value === "string") {
            code = value;
            // Try to detect language from content
            language = this.detectLanguageFromContent(value);
        } else {
            code = String(value);
        }

        return { code, language };
    }

    /**
     * Detect programming language from code content
     * @param {string} code - Code content
     * @returns {string} - Detected language
     */
    static detectLanguageFromContent(code) {
        const lowerCode = code.toLowerCase();

        // Simple language detection based on common patterns
        if (lowerCode.includes("function") && lowerCode.includes("{")) {
            return "javascript";
        } else if (lowerCode.includes("def ") && lowerCode.includes(":")) {
            return "python";
        } else if (
            lowerCode.includes("public class") ||
            lowerCode.includes("import java")
        ) {
            return "java";
        } else if (lowerCode.includes("<?php")) {
            return "php";
        } else if (
            lowerCode.includes("#include") ||
            lowerCode.includes("int main")
        ) {
            return "c";
        } else if (lowerCode.includes("SELECT") || lowerCode.includes("FROM")) {
            return "sql";
        } else if (lowerCode.includes("<html") || lowerCode.includes("<div")) {
            return "html";
        } else if (
            lowerCode.includes("body {") ||
            lowerCode.includes(".class")
        ) {
            return "css";
        }

        return "text";
    }
}

module.exports = CodeContentGenerator;
