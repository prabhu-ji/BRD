const { Graphviz } = require("@hpcc-js/wasm-graphviz");
const AttachmentUploader = require("./AttachmentUploader");
const Logger = require("../utils/Logger");

/**
 * Handles GraphViz diagram processing, rendering, and uploading
 */
class GraphVizProcessor {
    /**
     * Render GraphViz DOT code to PNG image
     * @param {string} dotCode - DOT code to render
     * @param {string} filename - Target filename
     * @returns {Promise<Object>} - Render result with buffer
     */
    static async renderToImage(dotCode, filename) {
        try {
            Logger.graphvizProcessing(`Rendering diagram: ${filename}`);
            Logger.debug(`DOT code length: ${dotCode.length} characters`);

            // Preprocess DOT code to improve layout
            const processedDotCode = this.preprocessDotCode(dotCode);
            Logger.debug('Processed DOT code:', processedDotCode);

            // Initialize GraphViz renderer
            const graphviz = await Graphviz.load();

            // Render DOT code to SVG
            const svgResult = graphviz.dot(processedDotCode, "svg");
            Logger.success(`SVG generated successfully (${svgResult.length} chars)`);

            // Convert SVG to PNG using Sharp with better sizing
            const sharp = require("sharp");
            
            // First, get SVG metadata to calculate proper dimensions
            const svgBuffer = Buffer.from(svgResult);
            const metadata = await sharp(svgBuffer).metadata();
            
            // Calculate optimal dimensions with minimum sizes for readability
            let targetWidth = 1200;  // Increased minimum width
            let targetHeight = 900;  // Increased minimum height
            
            if (metadata.width && metadata.height) {
                const aspectRatio = metadata.width / metadata.height;
                
                // Ensure minimum readable size
                const minWidth = 800;
                const minHeight = 600;
                
                if (aspectRatio > 2) {
                    // Wide diagram - force more square proportions
                    targetWidth = Math.max(1200, metadata.width * 0.8);
                    targetHeight = Math.max(900, targetWidth / 1.5);
                } else if (aspectRatio < 0.7) {
                    // Tall diagram
                    targetHeight = Math.max(1200, metadata.height * 0.8);
                    targetWidth = Math.max(800, targetHeight * 0.8);
                } else {
                    // Normal aspect ratio - ensure good minimum size
                    targetWidth = Math.max(minWidth, metadata.width * 1.2);
                    targetHeight = Math.max(minHeight, metadata.height * 1.2);
                }
            }

            const pngBuffer = await sharp(svgBuffer)
                .png({
                    quality: 95,
                    compressionLevel: 6,
                })
                .resize(Math.round(targetWidth), Math.round(targetHeight), {
                    fit: "inside",
                    withoutEnlargement: false,
                    kernel: sharp.kernel.lanczos3,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .toBuffer();

            Logger.success(`PNG image generated: ${pngBuffer.length} bytes (${Math.round(targetWidth)}x${Math.round(targetHeight)})`);

            return {
                success: true,
                buffer: pngBuffer,
                format: "png",
                size: pngBuffer.length,
                dimensions: {
                    width: Math.round(targetWidth),
                    height: Math.round(targetHeight)
                }
            };
        } catch (error) {
            Logger.error(`Error rendering GraphViz diagram:`, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Preprocess DOT code to improve layout and prevent thin diagrams
     * @param {string} dotCode - Original DOT code
     * @returns {string} Processed DOT code
     */
    static preprocessDotCode(dotCode) {
        let processed = dotCode.trim();

        // Add graph attributes for better layout if not present
        if (!processed.includes('rankdir') && !processed.includes('graph [')) {
            // Force top-to-bottom layout for better vertical wrapping
            processed = processed.replace(
                /(digraph\s+\w*\s*{)/i,
                '$1\n    graph [rankdir=TB, splines=ortho, nodesep=1.2, ranksep=1.5, concentrate=true];'
            );
        }

        // Add node attributes for better appearance and size if not present
        if (!processed.includes('node [')) {
            processed = processed.replace(
                /(graph \[.*?\];)/i,
                '$1\n    node [shape=box, style="rounded,filled", fillcolor=lightblue, fontname="Arial", fontsize=12, width=2.0, height=0.8, fixedsize=false];'
            );
        }

        // Add edge attributes if not present
        if (!processed.includes('edge [')) {
            processed = processed.replace(
                /(node \[.*?\];)/i,
                '$1\n    edge [fontname="Arial", fontsize=10, color=darkgray, penwidth=2];'
            );
        }

        // Force vertical wrapping by analyzing the structure and adding rank constraints
        processed = this.addVerticalWrapping(processed);

        Logger.debug('Preprocessed DOT code with vertical layout improvements');
        return processed;
    }

    /**
     * Add vertical wrapping constraints to prevent thin horizontal layouts
     * @param {string} dotCode - DOT code to process
     * @returns {string} DOT code with wrapping constraints
     */
    static addVerticalWrapping(dotCode) {
        // Extract actual node names from edges and node declarations
        const nodes = new Set();
        
        // Find all edges (node1 -> node2)
        const edgeMatches = dotCode.match(/(\w+|\".+?\")\s*->\s*(\w+|\".+?\")/g);
        if (edgeMatches) {
            edgeMatches.forEach(edge => {
                const parts = edge.split('->').map(part => part.trim());
                parts.forEach(part => {
                    // Remove quotes and clean up node names
                    const cleanNode = part.replace(/[\"]/g, '').trim();
                    if (cleanNode && !cleanNode.includes('[') && !cleanNode.includes('=')) {
                        nodes.add(cleanNode);
                    }
                });
            });
        }
        
        // Find standalone node declarations
        const nodeDeclarations = dotCode.match(/^\s*(\w+|\".+?\")\s*(\[.*?\])?\s*;?\s*$/gm);
        if (nodeDeclarations) {
            nodeDeclarations.forEach(decl => {
                const nodeMatch = decl.match(/^\s*(\w+|\".+?\")/);
                if (nodeMatch) {
                    const cleanNode = nodeMatch[1].replace(/[\"]/g, '').trim();
                    if (cleanNode && 
                        !cleanNode.includes('graph') && 
                        !cleanNode.includes('node') && 
                        !cleanNode.includes('edge') &&
                        !cleanNode.includes('=')) {
                        nodes.add(cleanNode);
                    }
                }
            });
        }

        const nodeArray = Array.from(nodes);
        Logger.debug(`Found ${nodeArray.length} nodes:`, nodeArray);

        // If we have more than 3 nodes, add rank constraints to force wrapping
        if (nodeArray.length > 3) {
            let rankConstraints = '';
            const maxNodesPerRank = 3;
            
            for (let i = 0; i < nodeArray.length; i += maxNodesPerRank) {
                const rankNodes = nodeArray.slice(i, i + maxNodesPerRank);
                if (rankNodes.length > 1) {
                    // Quote node names that contain spaces
                    const quotedNodes = rankNodes.map(node => 
                        node.includes(' ') ? `"${node}"` : node
                    );
                    rankConstraints += `\n    { rank=same; ${quotedNodes.join('; ')}; }`;
                }
            }

            // Insert rank constraints before the closing brace
            if (rankConstraints) {
                dotCode = dotCode.replace(/}\s*$/, `${rankConstraints}\n}`);
                Logger.debug('Added rank constraints for vertical wrapping');
            }
        }

        return dotCode;
    }

    /**
     * Upload GraphViz diagram as image attachment
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID to attach to
     * @param {string} dotCode - DOT code
     * @param {string} diagramName - Diagram name
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Upload result
     */
    static async uploadDiagram(confluenceClient, pageId, dotCode, diagramName, auth) {
        try {
            Logger.graphvizProcessing(`Processing diagram: ${diagramName}`);

            // Generate filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `${diagramName.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.png`;

            // Render the diagram
            const renderResult = await this.renderToImage(dotCode, filename);

            if (!renderResult.success) {
                Logger.error(`Failed to render diagram: ${renderResult.error}`);
                return {
                    success: false,
                    error: `Failed to render diagram: ${renderResult.error}`,
                };
            }

            // Upload the image
            const uploadResult = await AttachmentUploader.uploadFile(
                confluenceClient,
                pageId,
                renderResult.buffer,
                filename,
                "image/png",
                auth
            );

            if (uploadResult.success) {
                Logger.success(`GraphViz diagram uploaded: ${filename}`);
                return {
                    success: true,
                    filename: filename,
                    attachmentId: uploadResult.attachmentId,
                    url: uploadResult.url,
                    size: renderResult.size,
                };
            } else {
                Logger.error(`Upload failed: ${uploadResult.error}`);
                return {
                    success: false,
                    error: `Upload error: ${uploadResult.error}`,
                };
            }
        } catch (error) {
            Logger.error(`Error in uploadDiagram:`, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Process multiple GraphViz diagrams
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID to attach to
     * @param {Array} diagrams - Array of diagram objects
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Processing results
     */
    static async processMultipleDiagrams(confluenceClient, pageId, diagrams, auth) {
        const processedDiagrams = [];
        const failedDiagrams = [];

        Logger.info(`Processing ${diagrams.length} GraphViz diagrams`);

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
                Logger.error(`Error processing diagram ${diagram.diagramName}:`, error.message);
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
            message: `Processed ${processedDiagrams.length}/${diagrams.length} diagrams successfully`,
        };
    }

    /**
     * Replace GraphViz placeholders in content with rendered diagram images
     * @param {string} content - Content with placeholders
     * @param {Array} diagrams - Array of processed diagram objects
     * @returns {string} - Updated content with image references
     */
    static replaceGraphvizPlaceholders(content, diagrams) {
        let updatedContent = content;

        for (const diagram of diagrams) {
            try {
                const diagramId = diagram.diagramId;
                const placeholderPattern = `<!-- GRAPHVIZ_PLACEHOLDER_${diagramId}:[^>]*-->`;
                const regex = new RegExp(placeholderPattern, "g");

                // Determine optimal image width based on diagram dimensions
                let imageWidth = 1000; // Increased default width for better readability
                if (diagram.dimensions) {
                    const aspectRatio = diagram.dimensions.width / diagram.dimensions.height;
                    if (aspectRatio > 2) {
                        // Wide diagram - use full width
                        imageWidth = 1200;
                    } else if (aspectRatio < 0.8) {
                        // Tall diagram - use moderate width
                        imageWidth = 800;
                    } else {
                        // Normal diagram - use good readable width
                        imageWidth = 1000;
                    }
                }

                // Create modern Confluence image macro with proper sizing
                const imageContent = `
<p style="text-align: center;">
<ac:image ac:width="${imageWidth}">
    <ri:attachment ri:filename="${diagram.filename}" />
</ac:image>
</p>
<p style="text-align: center; font-size: 0.9em; color: #666; font-style: italic; margin-top: 5px;">
${diagram.diagramName}
</p>`;

                updatedContent = updatedContent.replace(regex, imageContent);
                Logger.success(`Replaced GraphViz placeholder for: ${diagram.diagramName} (width: ${imageWidth}px)`);
            } catch (error) {
                Logger.error(`Error replacing placeholder for ${diagram.diagramName}:`, error.message);
            }
        }

        return updatedContent;
    }

    /**
     * Extract GraphViz diagrams from content generation results
     * @param {Object} contentResult - Content generation result
     * @returns {Array} - Array of GraphViz diagram objects
     */
    static extractDiagrams(contentResult) {
        const diagrams = [];
        
        if (contentResult.graphvizDiagrams && Array.isArray(contentResult.graphvizDiagrams)) {
            diagrams.push(...contentResult.graphvizDiagrams);
        }

        return diagrams;
    }

    /**
     * Validate DOT code syntax
     * @param {string} dotCode - DOT code to validate
     * @returns {Object} - Validation result
     */
    static validateDotCode(dotCode) {
        try {
            // Basic validation - check for required structure
            if (!dotCode || typeof dotCode !== "string") {
                return { valid: false, error: "DOT code must be a non-empty string" };
            }

            const trimmed = dotCode.trim();
            
            // Check for basic GraphViz structure
            if (!trimmed.includes("digraph") && !trimmed.includes("graph")) {
                return { valid: false, error: "DOT code must contain 'digraph' or 'graph' declaration" };
            }

            // Check for balanced braces
            const openBraces = (trimmed.match(/{/g) || []).length;
            const closeBraces = (trimmed.match(/}/g) || []).length;
            
            if (openBraces !== closeBraces) {
                return { valid: false, error: "Unbalanced braces in DOT code" };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
}

module.exports = GraphVizProcessor; 