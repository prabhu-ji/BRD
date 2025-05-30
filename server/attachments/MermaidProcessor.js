const puppeteer = require("puppeteer");
const AttachmentUploader = require("./AttachmentUploader");
const Logger = require("../utils/Logger");

/**
 * Handles Mermaid diagram processing, rendering, and uploading
 */
class MermaidProcessor {
    /**
     * Render Mermaid code to PNG image using Puppeteer
     * @param {string} mermaidCode - Mermaid code to render
     * @param {string} filename - Target filename
     * @returns {Promise<Object>} - Render result with buffer
     */
    static async renderToImage(mermaidCode, filename) {
        let browser;
        try {
            Logger.info(`🎨 Rendering Mermaid diagram: ${filename}`);
            Logger.debug(
                `Mermaid code length: ${mermaidCode.length} characters`
            );

            // Preprocess Mermaid code to improve layout
            const processedMermaidCode =
                this.preprocessMermaidCode(mermaidCode);
            Logger.debug("Processed Mermaid code:", processedMermaidCode);

            // Launch headless browser with optimized settings
            browser = await puppeteer.launch({
                headless: "new", // Use new headless mode
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage", // Overcome limited resource problems
                    "--disable-accelerated-2d-canvas",
                    "--no-first-run",
                    "--no-zygote",
                    "--disable-gpu", // Disable GPU for better stability
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                ],
                defaultViewport: null, // Let page control viewport
            });

            const page = await browser.newPage();

            // Set larger viewport for high-quality rendering
            await page.setViewport({
                width: 1400,
                height: 1000,
                deviceScaleFactor: 2, // High DPI for crisp rendering
            });

            // Create optimized HTML content with Mermaid
            const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <script src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js"></script>
                    <style>
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background: #ffffff;
                            padding: 40px;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                        }
                        .diagram-container {
                            background: #ffffff;
                            border-radius: 8px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                            padding: 30px;
                            max-width: 90%;
                            overflow: visible;
                        }
                        .mermaid {
                            display: block;
                            text-align: center;
                            background: transparent;
                        }
                        .mermaid svg {
                            max-width: 100%;
                            height: auto;
                            background: transparent;
                        }
                    </style>
                </head>
                <body>
                    <div class="diagram-container">
                        <div class="mermaid" id="mermaid-diagram">
${processedMermaidCode}
                        </div>
                    </div>
                    <script>
                        // Configure Mermaid for optimal rendering
                        mermaid.initialize({
                            startOnLoad: false, // Manual initialization for better control
                            theme: 'default',
                            themeVariables: {
                                fontFamily: 'Segoe UI, Arial, sans-serif',
                                fontSize: '14px',
                                primaryColor: '#e3f2fd',
                                primaryTextColor: '#1565c0',
                                primaryBorderColor: '#1976d2',
                                lineColor: '#424242',
                                background: '#ffffff',
                                mainBkg: '#ffffff',
                                secondBkg: '#f5f5f5',
                                tertiaryColor: '#fafafa'
                            },
                            flowchart: {
                                useMaxWidth: false, // Let SVG control its size
                                htmlLabels: true,
                                curve: 'basis',
                                padding: 15,
                                nodeSpacing: 50,
                                rankSpacing: 50
                            },
                            sequence: {
                                diagramMarginX: 50,
                                diagramMarginY: 10,
                                actorMargin: 50,
                                width: 150,
                                height: 65,
                                boxMargin: 10,
                                boxTextMargin: 5,
                                noteMargin: 10,
                                messageMargin: 35,
                                mirrorActors: true,
                                bottomMarginAdj: 1
                            },
                            gantt: {
                                titleTopMargin: 25,
                                barHeight: 20,
                                fontFamily: 'Segoe UI, Arial, sans-serif',
                                fontSize: 11,
                                gridLineStartPadding: 35,
                                bottomPadding: 5,
                                leftPadding: 75,
                                sectionFontSize: 11,
                                numberSectionStyles: 4
                            }
                        });

                        // Render the diagram
                        async function renderDiagram() {
                            try {
                                const element = document.getElementById('mermaid-diagram');
                                if (!element) {
                                    console.error('Mermaid element not found');
                                    return;
                                }
                                
                                console.log('Starting Mermaid rendering...');
                                await mermaid.run();
                                console.log('Mermaid rendering complete');
                                
                                // Mark as ready for screenshot
                                document.body.setAttribute('data-render-complete', 'true');
                                
                            } catch (error) {
                                console.error('Mermaid rendering failed:', error);
                                document.body.setAttribute('data-render-error', error.message);
                            }
                        }

                        // Start rendering when page is ready
                        if (document.readyState === 'loading') {
                            document.addEventListener('DOMContentLoaded', renderDiagram);
                        } else {
                            renderDiagram();
                        }
                    </script>
                </body>
                </html>
            `;

            // Load HTML content
            await page.setContent(html, {
                waitUntil: "networkidle0", // Wait for all network requests
                timeout: 30000,
            });

            // Wait for Mermaid to fully render
            try {
                await page.waitForFunction(
                    () =>
                        document.body.getAttribute("data-render-complete") ===
                        "true",
                    { timeout: 15000 }
                );
            } catch (timeoutError) {
                // Check if there was a render error
                const renderError = await page.evaluate(() =>
                    document.body.getAttribute("data-render-error")
                );
                if (renderError) {
                    throw new Error(`Mermaid rendering failed: ${renderError}`);
                }
                throw new Error("Timeout waiting for Mermaid to render");
            }

            // Additional wait for any animations/transitions
            await new Promise((resolve) => setTimeout(resolve, 1500));

            // Find the rendered diagram container
            const diagramContainer = await page.$(".diagram-container");
            if (!diagramContainer) {
                throw new Error("Diagram container not found");
            }

            // Get the actual SVG element for size calculation
            const svgElement = await page.$(".mermaid svg");
            if (!svgElement) {
                throw new Error("SVG element not found after rendering");
            }

            // Get SVG dimensions for optimal screenshot
            const svgBox = await svgElement.boundingBox();
            Logger.debug(`SVG dimensions: ${svgBox.width}x${svgBox.height}`);

            // Take high-quality screenshot of the container
            const imageBuffer = await diagramContainer.screenshot({
                type: "png",
                omitBackground: false,
                captureBeyondViewport: true,
                clip: null, // Let it capture the full container
            });

            Logger.success(`PNG image generated: ${imageBuffer.length} bytes`);

            return {
                success: true,
                buffer: imageBuffer,
                format: "png",
                size: imageBuffer.length,
                dimensions: {
                    width: Math.ceil(svgBox.width + 60), // Add padding
                    height: Math.ceil(svgBox.height + 60),
                },
            };
        } catch (error) {
            Logger.error(`Error rendering Mermaid diagram:`, error.message);

            // Try to get page console logs for debugging
            if (browser) {
                try {
                    const pages = await browser.pages();
                    if (pages.length > 0) {
                        const page = pages[0];
                        const logs = await page.evaluate(() => {
                            return window.console._logs || [];
                        });
                        if (logs.length > 0) {
                            Logger.debug("Browser console logs:", logs);
                        }
                    }
                } catch (logError) {
                    // Ignore log retrieval errors
                }
            }

            return {
                success: false,
                error: error.message,
            };
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    /**
     * Preprocess Mermaid code to improve layout and rendering
     * @param {string} mermaidCode - Original Mermaid code
     * @returns {string} Processed Mermaid code
     */
    static preprocessMermaidCode(mermaidCode) {
        let processed = mermaidCode.trim();

        // Fix class syntax issues - remove invalid "class NodeName className" statements
        // These cause syntax errors in Mermaid
        processed = processed.replace(/^[\s]*class\s+\w+\s+\w+[\s]*$/gm, "");

        // Clean up problematic classDef statements
        if (
            processed.includes("classDef default") &&
            processed.includes("fill:#f9f")
        ) {
            // Remove the conflicting classDef statements but preserve the structure
            processed = processed.replace(
                /classDef\s+default\s+fill:#f9f[^;]*;?/g,
                ""
            );
            processed = processed.replace(
                /classDef\s+process\s+fill:#ff9[^;]*;?/g,
                ""
            );
            processed = processed.replace(
                /classDef\s+decision\s+fill:#f96[^;]*;?/g,
                ""
            );
        }

        // CRITICAL FIX: Sanitize edge labels to remove special Unicode characters
        // Replace problematic characters in edge labels |Label Text|
        processed = processed.replace(/\|([^|]+)\|/g, (match, labelText) => {
            let cleanLabel = labelText
                // Replace mathematical symbols
                .replace(/≥/g, ">=")
                .replace(/≤/g, "<=")
                .replace(/±/g, "+/-")
                .replace(/×/g, "x")
                .replace(/÷/g, "/")
                .replace(/∑/g, "sum")
                // Replace arrows and directional symbols
                .replace(/→/g, "to")
                .replace(/←/g, "from")
                .replace(/↑/g, "up")
                .replace(/↓/g, "down")
                .replace(/⇒/g, "then")
                .replace(/⇐/g, "from")
                // Replace copyright and trademark symbols
                .replace(/©/g, "(c)")
                .replace(/®/g, "(R)")
                .replace(/™/g, "(TM)")
                // Replace currency and percentage symbols
                .replace(/€/g, "EUR")
                .replace(/£/g, "GBP")
                .replace(/¥/g, "JPY")
                .replace(/¢/g, "cents")
                .replace(/%/g, "percent")
                // Replace other common problematic characters
                .replace(/•/g, "*")
                .replace(/…/g, "...")
                .replace(/–/g, "-")
                .replace(/—/g, "-")
                .replace(/'/g, "'")
                .replace(/'/g, "'")
                .replace(/"/g, '"')
                .replace(/"/g, '"')
                // Remove any remaining non-ASCII characters
                .replace(/[^\x00-\x7F]/g, "")
                // Clean up multiple spaces and trim
                .replace(/\s+/g, " ")
                .trim();

            // Aggressive simplification for problematic patterns
            // Simplify complex business logic descriptions
            cleanLabel = cleanLabel
                .replace(
                    /Date of Exit.*?Jan.*?2020.*?and.*?Active/gi,
                    "Filter Active and Terminated Records"
                )
                .replace(
                    /Sync.*?Inactive.*?Employees.*?Date.*?Exit/gi,
                    "Process Employee Records"
                )
                .replace(/\(Date of Exit.*?\)/gi, "")
                .replace(/\(.*?Jan.*?2020.*?\)/gi, "")
                .replace(/\bActive and Inactive\b/gi, "All")
                .replace(/\bMissing Mandatory Fields\b/gi, "Missing Fields")
                .replace(/\bPending Profiles\b/gi, "Pending Records")
                .replace(/\bEmployee Data\b/gi, "Employee Info")
                .replace(/\band Active Employees\b/gi, "and Active Records")
                .trim();

            // Remove problematic parenthetical expressions
            cleanLabel = cleanLabel.replace(/\([^)]*\)/g, "").trim();

            // Remove multiple spaces again
            cleanLabel = cleanLabel.replace(/\s+/g, " ").trim();

            // Ensure label is not too long (max 35 characters for safety)
            if (cleanLabel.length > 35) {
                cleanLabel = cleanLabel.substring(0, 32) + "...";
            }

            // Fallback to simple labels if still problematic
            if (
                cleanLabel.length > 35 ||
                /[^a-zA-Z0-9\s.,:-]/.test(cleanLabel)
            ) {
                // Use generic labels based on position
                const simpleLabels = [
                    "Send Data",
                    "Process Records",
                    "Filter Data",
                    "Validate Records",
                    "Transfer Data",
                ];
                cleanLabel =
                    simpleLabels[
                        Math.floor(Math.random() * simpleLabels.length)
                    ];
            }

            return `|${cleanLabel}|`;
        });

        // CRITICAL FIX: Remove invalid mixed syntax that causes STADIUMSTART errors
        // Pattern: Node with style trying to also define shape: A:::style([Shape])
        processed = processed.replace(
            /(\w+):::([\w]+)\s*(\[[^\]]+\]|\([^)]+\)|{[^}]+})/g,
            "$1:::$2"
        );

        // Remove node redefinitions after connections (causes parse errors)
        const lines = processed.split("\n");
        const cleanedLines = [];
        let hasConnections = false;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Track if we've seen connections
            if (
                trimmedLine.includes("-->") ||
                trimmedLine.includes("---") ||
                trimmedLine.includes("-.->")
            ) {
                hasConnections = true;
                cleanedLines.push(line);
            }
            // Remove node redefinitions that come after connections
            else if (
                hasConnections &&
                trimmedLine.match(/^\w+(::\w+)?\s*[\[\({]/)
            ) {
                Logger.debug(
                    `Removing invalid node redefinition: ${trimmedLine}`
                );
                // Skip this line - it's a node redefinition after connections
                continue;
            }
            // Keep all other lines (classDef, flowchart declaration, etc.)
            else {
                cleanedLines.push(line);
            }
        }

        processed = cleanedLines.join("\n");

        // Fix node names that might cause syntax errors
        // Replace underscores in node names with safe characters
        processed = processed.replace(
            /\b(\w+)_(\w+)(_\w+)*\b/g,
            (match, ...parts) => {
                // Convert HR_Term_Bot to HRTermBot, etc.
                return match.replace(/_/g, "");
            }
        );

        // Fix any problematic color values in classDef
        // Ensure all hex colors are properly formatted
        processed = processed.replace(/fill:#([a-fA-F0-9]{6}),/g, "fill:#$1,");
        processed = processed.replace(
            /stroke:#([a-fA-F0-9]{6}),/g,
            "stroke:#$1,"
        );

        // Ensure stroke-width values are valid
        processed = processed.replace(
            /stroke-width:(\d+)px/g,
            "stroke-width:$1px"
        );

        // Ensure we don't remove all the content - if the processing removed too much, start over with minimal fixes
        const hasConnections2 =
            processed.includes("-->") ||
            processed.includes("---") ||
            processed.includes("-.->");
        const hasFlowchart =
            processed.includes("flowchart") || processed.includes("graph");

        if (hasFlowchart && !hasConnections2) {
            // The processing removed too much content, let's be more conservative
            processed = mermaidCode.trim();

            // Only remove the invalid class statements and fix node names
            processed = processed.replace(
                /^[\s]*class\s+\w+\s+\w+[\s]*$/gm,
                ""
            );
            processed = processed.replace(
                /\b(\w+)_(\w+)(_\w+)*\b/g,
                (match) => {
                    return match.replace(/_/g, "");
                }
            );
            // Also fix the mixed syntax issue and edge labels
            processed = processed.replace(
                /(\w+):::([\w]+)\s*(\[[^\]]+\]|\([^)]+\)|{[^}]+})/g,
                "$1:::$2"
            );

            // Apply edge label cleaning again
            processed = processed.replace(
                /\|([^|]+)\|/g,
                (match, labelText) => {
                    let cleanLabel = labelText
                        .replace(/[^\x00-\x7F]/g, "")
                        .replace(/\s+/g, " ")
                        .trim();
                    if (cleanLabel.length > 40) {
                        cleanLabel = cleanLabel.substring(0, 37) + "...";
                    }
                    return `|${cleanLabel}|`;
                }
            );
        }

        // Add our own clean styling if no classDef exists
        if (
            !processed.includes("classDef") &&
            processed.includes("flowchart")
        ) {
            processed +=
                "\n    classDef default fill:#e1f5fe,stroke:#0277bd,stroke-width:2px,color:#01579b";
        }

        // Clean up line breaks and formatting
        processed = processed.replace(/;\s*\n/g, "\n    ");
        processed = processed.replace(/\n\s*\n/g, "\n");
        processed = processed.replace(/^\s+/gm, "    "); // Ensure consistent indentation
        processed = processed.replace(/;+$/gm, ""); // Remove trailing semicolons

        Logger.debug("Preprocessed Mermaid code with syntax fixes");
        return processed;
    }

    /**
     * Upload Mermaid diagram as image attachment
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID to attach to
     * @param {string} mermaidCode - Mermaid code
     * @param {string} diagramName - Diagram name
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Upload result
     */
    static async uploadDiagram(
        confluenceClient,
        pageId,
        mermaidCode,
        diagramName,
        auth
    ) {
        try {
            Logger.info(`🎨 Processing Mermaid diagram: ${diagramName}`);

            // Generate filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `${diagramName.replace(
                /[^a-zA-Z0-9]/g,
                "_"
            )}_${timestamp}.png`;

            // Render the diagram
            const renderResult = await this.renderToImage(
                mermaidCode,
                filename
            );

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
                Logger.success(`Mermaid diagram uploaded: ${filename}`);
                return {
                    success: true,
                    filename: filename,
                    attachmentId: uploadResult.attachmentId,
                    url: uploadResult.url,
                    size: renderResult.size,
                    mermaidCode: mermaidCode, // Preserve source code
                    dimensions: renderResult.dimensions,
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
     * Process multiple Mermaid diagrams
     * @param {Object} confluenceClient - Confluence API client
     * @param {string} pageId - Page ID to attach to
     * @param {Array} diagrams - Array of diagram objects
     * @param {Object} auth - Authentication credentials
     * @returns {Promise<Object>} - Processing results
     */
    static async processMultipleDiagrams(
        confluenceClient,
        pageId,
        diagrams,
        auth
    ) {
        const processedDiagrams = [];
        const failedDiagrams = [];

        Logger.info(`Processing ${diagrams.length} Mermaid diagrams`);

        for (const diagram of diagrams) {
            try {
                const uploadResult = await this.uploadDiagram(
                    confluenceClient,
                    pageId,
                    diagram.mermaidCode || diagram.dotCode, // Handle transition period
                    diagram.diagramName,
                    auth
                );

                if (uploadResult.success) {
                    processedDiagrams.push({
                        ...uploadResult,
                        diagramId: diagram.diagramId,
                        diagramName: diagram.diagramName,
                        mermaidCode: uploadResult.mermaidCode,
                        type: "mermaid",
                    });
                } else {
                    failedDiagrams.push({
                        ...uploadResult,
                        diagramName: diagram.diagramName,
                    });
                }
            } catch (error) {
                Logger.error(
                    `Error processing diagram ${diagram.diagramName}:`,
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
            message: `Processed ${processedDiagrams.length}/${diagrams.length} diagrams successfully`,
        };
    }

    /**
     * Replace Mermaid placeholders in content with rendered diagram images
     * @param {string} content - Content with placeholders
     * @param {Array} diagrams - Array of processed diagram objects
     * @returns {string} - Updated content with image references
     */
    static replaceMermaidPlaceholders(content, diagrams) {
        let updatedContent = content;

        for (const diagram of diagrams) {
            try {
                const diagramId = diagram.diagramId;
                // Support both MERMAID and GRAPHVIZ placeholders during transition
                const mermaidPlaceholderPattern = `<!-- MERMAID_PLACEHOLDER_${diagramId}:[^>]*-->`;
                const graphvizPlaceholderPattern = `<!-- GRAPHVIZ_PLACEHOLDER_${diagramId}:[^>]*-->`;
                const mermaidRegex = new RegExp(mermaidPlaceholderPattern, "g");
                const graphvizRegex = new RegExp(
                    graphvizPlaceholderPattern,
                    "g"
                );

                // Determine optimal image width based on diagram dimensions
                let imageWidth = 600; // Increased default width for better readability
                if (diagram.dimensions) {
                    const aspectRatio =
                        diagram.dimensions.width / diagram.dimensions.height;
                    if (aspectRatio > 2) {
                        // Wide diagram - use full width
                        imageWidth = 800;
                    } else if (aspectRatio < 0.8) {
                        // Tall diagram - use moderate width
                        imageWidth = 400;
                    } else {
                        // Normal diagram - use good readable width
                        imageWidth = 600;
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

                // Replace both placeholder types during transition
                updatedContent = updatedContent.replace(
                    mermaidRegex,
                    imageContent
                );
                updatedContent = updatedContent.replace(
                    graphvizRegex,
                    imageContent
                );

                Logger.success(
                    `Replaced Mermaid placeholder for: ${diagram.diagramName} (width: ${imageWidth}px)`
                );
            } catch (error) {
                Logger.error(
                    `Error replacing placeholder for ${diagram.diagramName}:`,
                    error.message
                );
            }
        }

        return updatedContent;
    }

    /**
     * Extract Mermaid diagrams from content generation results
     * @param {Object} contentResult - Content generation result
     * @returns {Array} - Array of Mermaid diagram objects
     */
    static extractDiagrams(contentResult) {
        const diagrams = [];

        // Support both new mermaidDiagrams and legacy graphvizDiagrams during transition
        if (
            contentResult.mermaidDiagrams &&
            Array.isArray(contentResult.mermaidDiagrams)
        ) {
            diagrams.push(...contentResult.mermaidDiagrams);
        }

        // Legacy support during transition
        if (
            contentResult.graphvizDiagrams &&
            Array.isArray(contentResult.graphvizDiagrams)
        ) {
            diagrams.push(...contentResult.graphvizDiagrams);
        }

        return diagrams;
    }

    /**
     * Validate Mermaid code syntax for version 11.6.0 compliance
     * @param {string} mermaidCode - Mermaid code to validate
     * @returns {Object} - Validation result
     */
    static validateMermaidCode(mermaidCode) {
        try {
            // Basic validation - check for required structure
            if (!mermaidCode || typeof mermaidCode !== "string") {
                return {
                    valid: false,
                    error: "Mermaid code must be a non-empty string",
                };
            }

            const trimmed = mermaidCode.trim();

            // Check for basic Mermaid diagram types
            const validDiagramTypes = [
                "flowchart",
                "graph",
                "sequenceDiagram",
                "classDiagram",
                "stateDiagram",
                "gitgraph",
                "journey",
                "gantt",
                "pie",
                "erDiagram",
                "quadrantChart",
                "requirementDiagram",
            ];

            const hasValidDiagramType = validDiagramTypes.some((type) =>
                trimmed.includes(type)
            );

            if (!hasValidDiagramType) {
                return {
                    valid: false,
                    error: "Mermaid code must contain a valid diagram type (flowchart, graph, sequenceDiagram, etc.)",
                };
            }

            // Mermaid 11.6.0 specific syntax validation
            // Check for invalid "class NodeName className" syntax
            const invalidClassPattern = /^\s*class\s+\w+\s+\w+\s*$/m;
            if (invalidClassPattern.test(trimmed)) {
                return {
                    valid: false,
                    error: "Invalid syntax: 'class NodeName className' statements are not supported in Mermaid 11.6.0. Use 'NodeName:::className' instead.",
                };
            }

            // Check for problematic node names with underscores
            const problematicNodeNames = trimmed.match(/\b\w+_\w+(_\w+)*\b/g);
            if (problematicNodeNames) {
                Logger.warn(
                    `Found node names with underscores that may cause syntax errors: ${problematicNodeNames.join(
                        ", "
                    )}`
                );
                // Don't fail validation, but warn - these will be fixed by preprocessing
            }

            // Check for invalid color values in classDef
            const colorPattern = /fill:#([a-fA-F0-9]{3,6}),/g;
            const colorMatches = [...trimmed.matchAll(colorPattern)];
            for (const match of colorMatches) {
                const colorValue = match[1];
                if (colorValue.length !== 3 && colorValue.length !== 6) {
                    return {
                        valid: false,
                        error: `Invalid color value: #${colorValue}. Colors must be 3 or 6 hex digits.`,
                    };
                }
            }

            // Basic syntax validation for flowcharts
            if (trimmed.includes("flowchart") || trimmed.includes("graph")) {
                // Check for basic flowchart syntax
                if (
                    !trimmed.includes("-->") &&
                    !trimmed.includes("---") &&
                    !trimmed.includes("-.->")
                ) {
                    return {
                        valid: false,
                        error: "Flowchart diagrams should contain connection syntax (-->, ---, etc.)",
                    };
                }

                // Check for proper classDef syntax if classes are used
                const classDefMatches = trimmed.match(/classDef\s+\w+/g);
                const styleApplications = trimmed.match(/:::\w+/g);

                if (classDefMatches && styleApplications) {
                    // Extract class names from classDef statements
                    const definedClasses = classDefMatches.map(
                        (match) =>
                            match.replace("classDef ", "").split(/\s+/)[0] // Get only the class name, ignore properties
                    );
                    // Extract class names from style applications
                    const appliedClasses = styleApplications.map((match) =>
                        match.replace(":::", "")
                    );

                    // Check if all applied classes are defined
                    const undefinedClasses = appliedClasses.filter(
                        (className) => !definedClasses.includes(className)
                    );

                    // Only warn for undefined classes, don't fail validation
                    // This allows for more flexibility in complex diagrams
                    if (undefinedClasses.length > 0) {
                        Logger.warn(
                            `Some undefined classes found: ${undefinedClasses.join(
                                ", "
                            )}. This is usually fine if classes are defined elsewhere or using default styling.`
                        );
                        // Don't fail validation - just warn
                    }
                }
            }

            // Check for sequence diagram syntax
            if (trimmed.includes("sequenceDiagram")) {
                if (
                    !trimmed.includes("participant") &&
                    !trimmed.includes("->>") &&
                    !trimmed.includes("-->>")
                ) {
                    return {
                        valid: false,
                        error: "Sequence diagrams should contain participants and message flows (->>>, -->>, etc.)",
                    };
                }
            }

            // Check for problematic edge labels with special characters
            const edgeLabels = trimmed.match(/\|([^|]+)\|/g);
            if (edgeLabels) {
                const problematicLabels = edgeLabels.filter((label) => {
                    const labelText = label.slice(1, -1); // Remove | characters
                    return /[^\x00-\x7F]/.test(labelText); // Contains non-ASCII characters
                });

                if (problematicLabels.length > 0) {
                    Logger.warn(
                        `Found edge labels with special characters that may cause parsing errors: ${problematicLabels.join(
                            ", "
                        )}`
                    );
                    // Don't fail validation, but warn - these will be fixed by preprocessing
                }

                // Check for overly long labels
                const longLabels = edgeLabels.filter((label) => {
                    const labelText = label.slice(1, -1);
                    return labelText.length > 40;
                });

                if (longLabels.length > 0) {
                    Logger.warn(
                        `Found overly long edge labels that may cause issues: ${longLabels
                            .map((l) => l.substring(0, 20) + "...")
                            .join(", ")}`
                    );
                }
            }

            return { valid: true, version: "11.6.0" };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Preserve source code for client response
     * @param {string} diagramId - Diagram identifier
     * @param {string} mermaidCode - Mermaid source code
     * @param {string} diagramName - Diagram name
     * @returns {Object} - Preserved diagram data
     */
    static preserveSourceCode(diagramId, mermaidCode, diagramName) {
        return {
            diagramId,
            diagramName,
            mermaidCode,
            type: "mermaid",
            timestamp: new Date().toISOString(),
        };
    }

    // Backward compatibility methods during transition

    /**
     * Legacy method for backward compatibility - redirects to renderToImage
     * @deprecated Use renderToImage instead
     */
    static async renderGraphvizToImage(dotCode, filename) {
        Logger.warn(
            "renderGraphvizToImage is deprecated. Use renderToImage with Mermaid code instead."
        );
        return await this.renderToImage(dotCode, filename);
    }

    /**
     * Legacy method for backward compatibility - redirects to replaceMermaidPlaceholders
     * @deprecated Use replaceMermaidPlaceholders instead
     */
    static replaceGraphvizPlaceholders(content, diagrams) {
        Logger.warn(
            "replaceGraphvizPlaceholders is deprecated. Use replaceMermaidPlaceholders instead."
        );
        return this.replaceMermaidPlaceholders(content, diagrams);
    }
}

module.exports = MermaidProcessor;
