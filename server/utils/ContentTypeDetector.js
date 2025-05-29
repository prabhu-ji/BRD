/**
 * Content type detection utilities for determining how to render different data types
 */
class ContentTypeDetector {
    /**
     * Detect content type for AI-generated content
     * @param {string} key - Section key
     * @param {*} value - Content value
     * @returns {string} - Detected content type
     */
    static detectContentType(key, value) {
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

    /**
     * Check if array represents table data
     * @param {Array} value - Array to check
     * @returns {boolean} - True if table data
     */
    static isTableData(value) {
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
     * Normalize key for flexible matching
     * @param {string} key - Key to normalize
     * @returns {string} - Normalized key
     */
    static normalizeKeyForMatching(key) {
        return key
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "");
    }

    /**
     * Extract content from AI-generated objects
     * @param {*} value - Value to extract content from
     * @returns {*} - Extracted content
     */
    static extractContent(value) {
        if (typeof value === "object" && value !== null) {
            if (value.content) return value.content;
            if (value.code) return value.code;
            if (value.diagram) return value.diagram;
            if (value.graphviz) return value.graphviz;
            if (value.dot) return value.dot;
        }
        return value;
    }

    /**
     * Extract metadata from AI-generated objects
     * @param {*} value - Value to extract metadata from
     * @returns {Object} - Extracted metadata
     */
    static extractMetadata(value) {
        const metadata = {};
        
        if (typeof value === "object" && value !== null) {
            if (value.type) metadata.type = value.type;
            if (value.language) metadata.language = value.language;
            if (value.title) metadata.title = value.title;
            if (value.headers) metadata.headers = value.headers;
            if (value.data) metadata.data = value.data;
        }
        
        return metadata;
    }

    /**
     * Determine if content is GraphViz diagram
     * @param {*} value - Content to check
     * @returns {boolean} - True if GraphViz content
     */
    static isGraphVizContent(value) {
        if (typeof value === "object" && value !== null) {
            if (value.type === "graphviz" || value.language === "dot") {
                return true;
            }
        }
        
        if (typeof value === "string") {
            return value.includes("digraph") || 
                   value.includes("->") || 
                   value.includes("graph {");
        }
        
        return false;
    }
}

module.exports = ContentTypeDetector; 