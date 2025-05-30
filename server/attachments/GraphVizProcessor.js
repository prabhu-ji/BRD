const AttachmentUploader = require("./AttachmentUploader");
const Logger = require("../utils/Logger");

/**
 * Handles GraphViz diagram processing, rendering, and uploading (MOCK VERSION)
 * Returns dummy data instead of actual GraphViz processing
 */
class GraphVizProcessor {
    /**
     * Render GraphViz DOT code to PNG image (MOCK)
     * @param {string} dotCode - DOT code to render
     * @param {string} filename - Target filename
     * @returns {Promise<Object>} - Mock render result with dummy buffer
     */
    static async renderToImage(dotCode, filename) {
        try {
            Logger.graphvizProcessing(`[MOCK] Rendering diagram: ${filename}`);
            Logger.debug(
                `[MOCK] DOT code length: ${dotCode.length} characters`
            );

            // Create a dummy PNG buffer (1x1 transparent pixel)
            const dummyPngBuffer = Buffer.from([
                0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
                0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x03, 0x20,
                0x00, 0x00, 0x02, 0x58, 0x08, 0x06, 0x00, 0x00, 0x00, 0x5a,
                0x7d, 0x85, 0x6f, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
                0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00,
                0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
                0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
            ]);

            const targetWidth = 800;
            const targetHeight = 600;

            Logger.success(
                `[MOCK] PNG image generated: ${dummyPngBuffer.length} bytes (${targetWidth}x${targetHeight})`
            );

            return {
                success: true,
                buffer: dummyPngBuffer,
                format: "png",
                size: dummyPngBuffer.length,
                dimensions: {
                    width: targetWidth,
                    height: targetHeight,
                },
            };
        } catch (error) {
            Logger.error(
                `[MOCK] Error rendering GraphViz diagram:`,
                error.message
            );
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Preprocess DOT code (MOCK - just returns the input)
     * @param {string} dotCode - Original DOT code
     * @returns {string} Processed DOT code (unchanged in mock)
     */
    static preprocessDotCode(dotCode) {
        Logger.debug("[MOCK] Preprocessed DOT code (no actual processing)");
        return dotCode.trim();
    }

    /**
     * Add vertical wrapping constraints (MOCK - just returns the input)
     * @param {string} dotCode - DOT code to process
     * @returns {string} DOT code (unchanged in mock)
     */
    static addVerticalWrapping(dotCode) {
        Logger.debug("[MOCK] Added vertical wrapping (no actual processing)");
        return dotCode;
    }

    /**
     * Upload GraphViz diagram as image attachment (MOCK)
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID to attach to
     * @param {string} dotCode - DOT code
     * @param {string} diagramName - Diagram name
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Mock upload result
     */
    static async uploadDiagram(
        confluenceClient,
        pageId,
        dotCode,
        diagramName,
        auth
    ) {
        try {
            Logger.graphvizProcessing(
                `[MOCK] Processing diagram: ${diagramName}`
            );

            // Generate filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `${diagramName.replace(
                /[^a-zA-Z0-9]/g,
                "_"
            )}_${timestamp}.png`;

            // Mock render the diagram
            const renderResult = await this.renderToImage(dotCode, filename);

            if (!renderResult.success) {
                Logger.error(
                    `[MOCK] Failed to render diagram: ${renderResult.error}`
                );
                return {
                    success: false,
                    error: `Failed to render diagram: ${renderResult.error}`,
                };
            }

            // Mock upload the image
            const mockUploadResult = {
                success: true,
                attachmentId: `mock-attachment-${Date.now()}`,
                url: `/mock/attachments/${filename}`,
            };

            if (mockUploadResult.success) {
                Logger.success(`[MOCK] GraphViz diagram uploaded: ${filename}`);
                return {
                    success: true,
                    filename: filename,
                    attachmentId: mockUploadResult.attachmentId,
                    url: mockUploadResult.url,
                    size: renderResult.size,
                };
            } else {
                Logger.error(`[MOCK] Upload failed: ${mockUploadResult.error}`);
                return {
                    success: false,
                    error: `Upload error: ${mockUploadResult.error}`,
                };
            }
        } catch (error) {
            Logger.error(`[MOCK] Error in uploadDiagram:`, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Process multiple GraphViz diagrams (MOCK)
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID to attach to
     * @param {Array} diagrams - Array of diagram objects
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Mock processing results
     */
    static async processMultipleDiagrams(
        confluenceClient,
        pageId,
        diagrams,
        auth
    ) {
        const processedDiagrams = [];
        const failedDiagrams = [];

        Logger.info(`[MOCK] Processing ${diagrams.length} GraphViz diagrams`);

        for (const diagram of diagrams) {
            try {
                const uploadResult = await this.uploadDiagram(
                    confluenceClient,
                    pageId,
                    diagram.dotCode,
                    diagram.diagramName,
                    auth
                );

                if (uploadResult.success) {
                    processedDiagrams.push({
                        ...uploadResult,
                        diagramId: diagram.diagramId,
                        diagramName: diagram.diagramName,
                        dotCode: diagram.dotCode,
                    });
                } else {
                    failedDiagrams.push({
                        ...uploadResult,
                        diagramName: diagram.diagramName,
                    });
                }
            } catch (error) {
                Logger.error(
                    `[MOCK] Error processing diagram ${diagram.diagramName}:`,
                    error.message
                );
                failedDiagrams.push({
                    diagramName: diagram.diagramName,
                    error: error.message,
                });
            }
        }

        return {
            success: failedDiagrams.length === 0,
            diagrams: processedDiagrams,
            errors: failedDiagrams,
            message: `[MOCK] Processed ${processedDiagrams.length}/${diagrams.length} diagrams successfully`,
        };
    }

    /**
     * Replace GraphViz placeholders in content with mock diagram images
     * @param {string} content - Content with placeholders
     * @param {Array} diagrams - Array of processed diagram objects
     * @returns {string} - Updated content with mock image references
     */
    static replaceGraphvizPlaceholders(content, diagrams) {
        let updatedContent = content;

        for (const diagram of diagrams) {
            try {
                const diagramId = diagram.diagramId;
                const placeholderPattern = `<!-- GRAPHVIZ_PLACEHOLDER_${diagramId}:[^>]*-->`;
                const regex = new RegExp(placeholderPattern, "g");

                const imageWidth = 1000; // Default width for mock

                // Create mock Confluence image macro
                const imageContent = `
<p style="text-align: center;">
<ac:image ac:width="${imageWidth}">
    <ri:attachment ri:filename="${diagram.filename}" />
</ac:image>
</p>
<p style="text-align: center; font-size: 0.9em; color: #666; font-style: italic; margin-top: 5px;">
${diagram.diagramName} [MOCK]
</p>`;

                updatedContent = updatedContent.replace(regex, imageContent);
                Logger.success(
                    `[MOCK] Replaced GraphViz placeholder for: ${diagram.diagramName} (width: ${imageWidth}px)`
                );
            } catch (error) {
                Logger.error(
                    `[MOCK] Error replacing placeholder for ${diagram.diagramName}:`,
                    error.message
                );
            }
        }

        return updatedContent;
    }

    /**
     * Extract GraphViz diagrams from content generation results (MOCK)
     * @param {Object} contentResult - Content generation result
     * @returns {Array} - Array of mock GraphViz diagram objects
     */
    static extractDiagrams(contentResult) {
        const diagrams = [];

        if (
            contentResult.graphvizDiagrams &&
            Array.isArray(contentResult.graphvizDiagrams)
        ) {
            diagrams.push(...contentResult.graphvizDiagrams);
        }

        Logger.info(`[MOCK] Extracted ${diagrams.length} GraphViz diagrams`);
        return diagrams;
    }

    /**
     * Validate DOT code syntax (MOCK - always returns valid)
     * @param {string} dotCode - DOT code to validate
     * @returns {Object} - Mock validation result (always valid)
     */
    static validateDotCode(dotCode) {
        try {
            // Basic validation - check for required structure
            if (!dotCode || typeof dotCode !== "string") {
                return {
                    valid: false,
                    error: "DOT code must be a non-empty string",
                };
            }

            const trimmed = dotCode.trim();

            // Check for basic GraphViz structure
            if (!trimmed.includes("digraph") && !trimmed.includes("graph")) {
                return {
                    valid: false,
                    error: "DOT code must contain 'digraph' or 'graph' declaration",
                };
            }

            Logger.debug("[MOCK] DOT code validation passed");
            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
}

module.exports = GraphVizProcessor;
