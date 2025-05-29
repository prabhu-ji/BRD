const HtmlUtils = require('../utils/HtmlUtils');
const ContentTypeDetector = require('../utils/ContentTypeDetector');
const Logger = require('../utils/Logger');

/**
 * Generates HTML content for diagram data, especially GraphViz diagrams
 */
class DiagramContentGenerator {
    /**
     * Generate diagram content
     * @param {string} key - Section key
     * @param {*} value - Content value
     * @returns {Object} - Generated content and diagram info
     */
    static generate(key, value) {
        let content = `<h3>${HtmlUtils.escapeHtml(key)}</h3>\n`;

        let code = "";
        let language = "text";
        let isGraphviz = false;

        Logger.debug(`Processing diagram content for ${key}`, typeof value, value);

        // Extract code and metadata
        const extractedData = this.extractDiagramData(value);
        code = extractedData.code;
        language = extractedData.language;
        isGraphviz = extractedData.isGraphviz;

        Logger.success(`Extracted diagram code (${code.length} chars, language: ${language}, isGraphviz: ${isGraphviz})`);

        // For GraphViz diagrams, create a placeholder for image rendering
        if (isGraphviz && language === "dot") {
            Logger.graphvizProcessing(`${key} - will render as image`);

            const diagramId = `graphviz_${key.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

            // Create a simple placeholder that will be replaced with image after upload
            content += `<!-- GRAPHVIZ_PLACEHOLDER_${diagramId}: ${Buffer.from(code).toString("base64")} -->`;

            return {
                content,
                isGraphviz: true,
                diagramId,
                diagramName: key,
                dotCode: code,
            };
        } else {
            // For non-GraphViz content, use code block
            content += HtmlUtils.createCodeBlock(code, language, key);
            return { content, isGraphviz: false };
        }
    }

    /**
     * Extract diagram data from various input formats
     * @param {*} value - Input value
     * @returns {Object} - Extracted code, language, and GraphViz flag
     */
    static extractDiagramData(value) {
        let code = "";
        let language = "text";
        let isGraphviz = false;

        if (typeof value === "object" && value !== null) {
            // Handle AI-generated objects with various content properties
            const metadata = ContentTypeDetector.extractMetadata(value);
            code = ContentTypeDetector.extractContent(value);

            if (!code) {
                // Try common graphviz content patterns
                const possibleKeys = ["graph", "digraph", "subgraph", "flowchart"];
                for (const possibleKey of possibleKeys) {
                    if (value[possibleKey]) {
                        code = value[possibleKey];
                        break;
                    }
                }

                // If still no content, use JSON representation for debugging
                if (!code) {
                    Logger.error(`Could not extract diagram content from object:`, value);
                    code = JSON.stringify(value, null, 2);
                    language = "json";
                }
            }

            // Set language based on content type or object properties
            if (metadata.type === "graphviz" || metadata.language === "dot" || 
                ContentTypeDetector.isGraphVizContent(value)) {
                language = "dot";
                isGraphviz = true;
            } else {
                language = metadata.language || "text";
            }
        } else if (typeof value === "string") {
            code = value;
            if (ContentTypeDetector.isGraphVizContent(value)) {
                language = "dot";
                isGraphviz = true;
            }
        } else {
            Logger.error(`Unexpected diagram value type:`, typeof value, value);
            code = String(value);
        }

        return { code, language, isGraphviz };
    }
}

module.exports = DiagramContentGenerator; 