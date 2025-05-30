const ContentTypeDetector = require("../utils/ContentTypeDetector");
const Logger = require("../utils/Logger");

const TextContentGenerator = require("./TextContentGenerator");
const TableContentGenerator = require("./TableContentGenerator");
const ListContentGenerator = require("./ListContentGenerator");
const DiagramContentGenerator = require("./DiagramContentGenerator");
const CodeContentGenerator = require("./CodeContentGenerator");

/**
 * Routes content generation to appropriate specialized generators
 */
class ContentRouter {
    /**
     * Route content to appropriate generator
     * @param {string} key - Section key
     * @param {*} value - Content value
     * @param {string} contentType - Override content type
     * @returns {Object} - Generated content and metadata
     */
    static route(key, value, contentType = null) {
        Logger.smartContentProcessing(key, contentType || "auto");

        const detectedType =
            contentType || ContentTypeDetector.detectContentType(key, value);

        let result = "";
        let diagramInfo = null;

        // Route to appropriate generator based on content type
        switch (detectedType) {
            case "text":
            case "short_text":
                result = TextContentGenerator.generate(key, value);
                break;
            case "table":
                result = TableContentGenerator.generate(key, value);
                break;
            case "diagram":
            case "mermaid":
            case "graphviz": // Legacy support
                const diagramResult = DiagramContentGenerator.generate(
                    key,
                    value
                );
                if (
                    typeof diagramResult === "object" &&
                    (diagramResult.isMermaid || diagramResult.isGraphviz)
                ) {
                    result = diagramResult.content;
                    diagramInfo = {
                        diagramId: diagramResult.diagramId,
                        diagramName: diagramResult.diagramName,
                        mermaidCode: diagramResult.mermaidCode,
                        dotCode: diagramResult.dotCode, // Legacy support
                        type: diagramResult.type,
                        isMermaid: diagramResult.isMermaid || false,
                        isGraphviz: diagramResult.isGraphviz || false
                    };
                } else {
                    result = diagramResult.content || diagramResult;
                }
                break;
            case "list":
                result = ListContentGenerator.generate(key, value);
                break;
            case "code":
                result = CodeContentGenerator.generate(key, value);
                break;
            case "empty":
                Logger.info(`Skipping empty section: ${key}`);
                result = "";
                break;
            default:
                Logger.warn(
                    `Unknown content type '${detectedType}' for section '${key}', using text generator`
                );
                result = TextContentGenerator.generate(key, value);
                break;
        }

        return {
            content: result,
            diagram: diagramInfo,
            contentType: detectedType,
        };
    }

    /**
     * Get available content generators
     * @returns {Object} - Map of content types to generators
     */
    static getGenerators() {
        return {
            text: TextContentGenerator,
            short_text: TextContentGenerator,
            table: TableContentGenerator,
            list: ListContentGenerator,
            diagram: DiagramContentGenerator,
            mermaid: DiagramContentGenerator,
            graphviz: DiagramContentGenerator, // Legacy support
            code: CodeContentGenerator,
        };
    }

    /**
     * Check if content type is supported
     * @param {string} contentType - Content type to check
     * @returns {boolean} - True if supported
     */
    static isSupported(contentType) {
        const generators = this.getGenerators();
        return Object.keys(generators).includes(contentType);
    }
}

module.exports = ContentRouter;
