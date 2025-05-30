const HtmlUtils = require('../utils/HtmlUtils');
const ContentTypeDetector = require('../utils/ContentTypeDetector');
const Logger = require('../utils/Logger');

/**
 * Generates HTML content for diagram data, especially Mermaid diagrams
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
        let isMermaid = false;
        let isGraphviz = false; // Keep for backward compatibility

        Logger.debug(`Processing diagram content for ${key}`, typeof value, value);

        // Extract code and metadata
        const extractedData = this.extractDiagramData(value);
        code = extractedData.code;
        language = extractedData.language;
        isMermaid = extractedData.isMermaid;
        isGraphviz = extractedData.isGraphviz; // Legacy support

        Logger.success(`Extracted diagram code (${code.length} chars, language: ${language}, isMermaid: ${isMermaid}, isGraphviz: ${isGraphviz})`);

        // For Mermaid diagrams, create a placeholder for image rendering
        if (isMermaid && language === "mermaid") {
            Logger.info(`🎨 ${key} - will render as Mermaid image`);

            const diagramId = `mermaid_${key.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

            // Create a simple placeholder that will be replaced with image after upload
            content += `<!-- MERMAID_PLACEHOLDER_${diagramId}: ${Buffer.from(code).toString("base64")} -->`;

            return {
                content,
                isMermaid: true,
                isGraphviz: false,
                diagramId,
                diagramName: key,
                mermaidCode: code,
                type: 'mermaid'
            };
        }
        // Legacy: For GraphViz diagrams during transition, create a placeholder for image rendering  
        else if (isGraphviz && language === "dot") {
            Logger.warn(`⚠️ ${key} - Legacy GraphViz detected, will render as image but consider migrating to Mermaid`);

            const diagramId = `graphviz_${key.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

            // Create a simple placeholder that will be replaced with image after upload
            content += `<!-- GRAPHVIZ_PLACEHOLDER_${diagramId}: ${Buffer.from(code).toString("base64")} -->`;

            return {
                content,
                isGraphviz: true,
                isMermaid: false,
                diagramId,
                diagramName: key,
                dotCode: code, // Legacy field name
                mermaidCode: code, // Also provide as mermaidCode for transition
                type: 'graphviz'
            };
        } else {
            // For non-diagram content, use code block
            content += HtmlUtils.createCodeBlock(code, language, key);
            return { content, isMermaid: false, isGraphviz: false };
        }
    }

    /**
     * Extract diagram data from various input formats
     * @param {*} value - Input value
     * @returns {Object} - Extracted code, language, and diagram type flags
     */
    static extractDiagramData(value) {
        let code = "";
        let language = "text";
        let isMermaid = false;
        let isGraphviz = false;

        if (typeof value === "object" && value !== null) {
            // Handle AI-generated objects with various content properties
            const metadata = ContentTypeDetector.extractMetadata(value);
            code = ContentTypeDetector.extractContent(value);

            if (!code) {
                // Try common diagram content patterns
                const possibleKeys = ["mermaid", "flowchart", "graph", "sequence", "class", "state", "digraph", "subgraph"];
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

            // Determine diagram type based on content type or object properties
            if (metadata.type === "mermaid" || metadata.language === "mermaid" || 
                ContentTypeDetector.isMermaidContent(value)) {
                language = "mermaid";
                isMermaid = true;
            } else if (metadata.type === "graphviz" || metadata.language === "dot" || 
                ContentTypeDetector.isGraphVizContent(value)) {
                language = "dot";
                isGraphviz = true;
            } else {
                language = metadata.language || "text";
            }
        } else if (typeof value === "string") {
            code = value;
            
            // Detect diagram type from string content
            const diagramType = ContentTypeDetector.detectDiagramType(value);
            if (diagramType.isDiagram) {
                if (diagramType.type === 'mermaid') {
                    language = "mermaid";
                    isMermaid = true;
                } else if (diagramType.type === 'graphviz') {
                    language = "dot";
                    isGraphviz = true;
                }
            }
        } else {
            Logger.error(`Unexpected diagram value type:`, typeof value, value);
            code = String(value);
        }

        return { code, language, isMermaid, isGraphviz };
    }
}

module.exports = DiagramContentGenerator; 