// Import utility modules
const Logger = require("./utils/Logger");
const PageStateManager = require("./utils/PageStateManager");
const ConfluenceApiClient = require("./utils/ConfluenceApiClient");
const PageContentBuilder = require("./utils/PageContentBuilder");

// Import attachment processing modules
const ImageAttachmentProcessor = require("./attachments/ImageAttachmentProcessor");
const CSVAttachmentProcessor = require("./attachments/CSVAttachmentProcessor");
const GraphVizProcessor = require("./attachments/GraphVizProcessor");

/**
 * Fully Refactored Confluence Generator - Clean Architecture Implementation
 *
 * This class follows Single Responsibility Principle and delegates specific tasks
 * to focused, modular components. It serves as the main orchestrator while each
 * module handles its own specific responsibility.
 *
 * Key Improvements:
 * - Modular design with clear separation of concerns
 * - Single Responsibility Principle throughout
 * - Reduced code duplication
 * - Enhanced testability and maintainability
 * - Consistent logging and error handling
 */
class ConfluenceGenerator {
    constructor(config = {}) {
        try {
            this.config = this.validateAndNormalizeConfig(config);
        } catch (error) {
            Logger.error(`Configuration validation failed: ${error.message}`);
            throw error;
        }

        // Initialize core components
        this.apiClient = new ConfluenceApiClient(this.config);
        this.pageStateManager = new PageStateManager(this.config.baseUrl);
        this.contentBuilder = new PageContentBuilder();

        Logger.success(
            "ConfluenceGenerator initialized with modular architecture"
        );
    }

    /**
     * Validate and normalize configuration
     * @param {Object} config - Configuration object
     * @returns {Object} Validated configuration
     */
    validateAndNormalizeConfig(config) {
        const normalizedConfig = {
            baseUrl: config.baseUrl || process.env.CONFLUENCE_BASE_URL,
            username: config.username || process.env.CONFLUENCE_USERNAME,
            apiToken: config.apiToken || process.env.CONFLUENCE_API_TOKEN,
            spaceKey:
                config.spaceKey || process.env.CONFLUENCE_SPACE_KEY || "BRD",
            parentPageId:
                config.parentPageId || process.env.CONFLUENCE_PARENT_PAGE_ID,
        };

        // Validate required fields
        const requiredFields = ["baseUrl", "username", "apiToken"];
        const missingFields = requiredFields.filter(
            (field) => !normalizedConfig[field]
        );

        if (missingFields.length > 0) {
            const errorMessage = `Configuration incomplete. Missing: ${missingFields.join(
                ", "
            )}`;
            console.error(`❌ ${errorMessage}`);
            throw new Error(errorMessage);
        }

        return normalizedConfig;
    }

    /**
     * Main method to create or update BRD page (handles everything automatically)
     * @param {Object} brdData - BRD data including sections and technical data
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Operation result
     */
    async createOrUpdateBRD(brdData, options = {}) {
        try {
            Logger.info("Starting BRD page creation/update process...");

            // Analyze BRD data
            this.contentBuilder.logBRDAnalysis(brdData);

            // Generate page title
            const pageTitle = this.contentBuilder.generatePageTitle(brdData);

            // Decide operation based on current state and options
            if (
                options.updateExisting &&
                this.pageStateManager.hasCurrentPage()
            ) {
                Logger.info(
                    `Updating existing page: ${this.pageStateManager.currentPageId}`
                );
                return await this.updateCurrentPage(brdData);
            } else {
                Logger.info("Creating new page");
                return await this.createNewPage(brdData, pageTitle, options);
            }
        } catch (error) {
            Logger.error("Error in createOrUpdateBRD:", error.message);
            return {
                success: false,
                error: error.message,
                suggestion: this.apiClient.getErrorSuggestion(error),
            };
        }
    }

    /**
     * Create a new Confluence page
     * @param {Object} brdData - BRD data
     * @param {string} pageTitle - Generated page title
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Creation result
     */
    async createNewPage(brdData, pageTitle, options = {}) {
        try {
            // Generate content
            const contentResult =
                await this.contentBuilder.generateConfluenceContent(brdData);

            // Create page payload
            const pagePayload = this.contentBuilder.createPagePayload(
                pageTitle,
                contentResult.content,
                this.config.spaceKey,
                options.parentPageId || this.config.parentPageId
            );

            // Create page via API
            const response = await this.apiClient.createPage(pagePayload);

            // Update page state
            this.pageStateManager.updateCurrentPageFromResponse(response.data);

            // Process attachments
            const attachmentResults = await this.processAttachments(
                brdData,
                contentResult
            );

            // Update content with GraphViz diagrams if needed
            if (
                attachmentResults.graphvizUpload?.success &&
                attachmentResults.graphvizUpload.diagrams.length > 0
            ) {
                await this.updatePageContentWithDiagrams(
                    contentResult.content,
                    attachmentResults.graphvizUpload.diagrams
                );
            }

            // Add to history
            this.pageStateManager.addToHistory(
                { ...response.data, operation: "create" },
                attachmentResults.imageUpload,
                attachmentResults.csvUpload,
                attachmentResults.graphvizUpload
            );

            Logger.success("New Confluence page created successfully");
            Logger.pageUrl(this.pageStateManager.getCurrentPageUrl());

            return this.pageStateManager.generateSuccessResult(
                "create",
                this.config.spaceKey,
                attachmentResults.imageUpload,
                attachmentResults.csvUpload,
                attachmentResults.graphvizUpload
            );
        } catch (error) {
            Logger.error("Error creating new page:", error.message);
            throw error;
        }
    }

    /**
     * Update the current page
     * @param {Object} brdData - BRD data
     * @returns {Promise<Object>} Update result
     */
    async updateCurrentPage(brdData) {
        try {
            this.pageStateManager.validateCurrentPage();

            // Get current page state
            const currentPage = await this.apiClient.getPage(
                this.pageStateManager.currentPageId,
                { expand: "version" }
            );
            const currentVersion = currentPage.data.version.number;

            // Generate content
            const contentResult =
                await this.contentBuilder.generateConfluenceContent(brdData);

            // Create update payload
            const updatePayload = this.contentBuilder.createUpdatePayload(
                this.pageStateManager.currentPageTitle,
                contentResult.content,
                currentVersion + 1
            );

            // Update page via API
            const response = await this.apiClient.updatePage(
                this.pageStateManager.currentPageId,
                updatePayload
            );

            // Update page state
            this.pageStateManager.updateCurrentPageFromResponse(response.data);

            // Process attachments
            const attachmentResults = await this.processAttachments(
                brdData,
                contentResult
            );

            // Update content with GraphViz diagrams if needed
            if (
                attachmentResults.graphvizUpload?.success &&
                attachmentResults.graphvizUpload.diagrams.length > 0
            ) {
                await this.updatePageContentWithDiagrams(
                    contentResult.content,
                    attachmentResults.graphvizUpload.diagrams
                );
            }

            Logger.success("Page updated successfully");
            Logger.pageUrl(this.pageStateManager.getCurrentPageUrl());

            return this.pageStateManager.generateSuccessResult(
                "update",
                this.config.spaceKey,
                attachmentResults.imageUpload,
                attachmentResults.csvUpload,
                attachmentResults.graphvizUpload
            );
        } catch (error) {
            Logger.error("Error updating current page:", error.message);
            throw error;
        }
    }

    /**
     * Process image and GraphViz attachments
     * @param {Object} brdData - BRD data
     * @param {Object} contentResult - Generated content result
     * @returns {Promise<Object>} Attachment processing results
     */
    async processAttachments(brdData, contentResult) {
        const results = {};

        // Process image attachments
        if (brdData.technicalData) {
            Logger.info("Starting image attachment upload...");
            results.imageUpload =
                await ImageAttachmentProcessor.uploadImageAttachments(
                    this.apiClient.getClient(),
                    this.pageStateManager.currentPageId,
                    brdData,
                    this.apiClient.getAuth()
                );

            if (results.imageUpload.uploaded?.length > 0) {
                Logger.success(
                    `Successfully uploaded ${results.imageUpload.uploaded.length} image attachments`
                );
            }
            if (results.imageUpload.failed?.length > 0) {
                Logger.warn(
                    `Failed to upload ${results.imageUpload.failed.length} image attachments`
                );
            }

            // Process CSV attachments
            Logger.info("Starting CSV attachment upload...");
            results.csvUpload =
                await CSVAttachmentProcessor.uploadCSVAttachments(
                    this.apiClient.getClient(),
                    this.pageStateManager.currentPageId,
                    brdData,
                    this.apiClient.getAuth()
                );

            if (results.csvUpload.uploaded?.length > 0) {
                Logger.success(
                    `Successfully uploaded ${results.csvUpload.uploaded.length} CSV attachments`
                );
            }
            if (results.csvUpload.failed?.length > 0) {
                Logger.warn(
                    `Failed to upload ${results.csvUpload.failed.length} CSV attachments`
                );
            }
        }

        // Process GraphViz diagrams
        if (contentResult.graphvizDiagrams?.length > 0) {
            Logger.info(
                `Processing ${contentResult.graphvizDiagrams.length} GraphViz diagrams...`
            );
            results.graphvizUpload =
                await GraphVizProcessor.processMultipleDiagrams(
                    this.apiClient.getClient(),
                    this.pageStateManager.currentPageId,
                    contentResult.graphvizDiagrams,
                    this.apiClient.getAuth()
                );

            if (results.graphvizUpload.success) {
                Logger.success(
                    `Successfully processed ${results.graphvizUpload.diagrams.length} GraphViz diagrams`
                );
            }
        }

        return results;
    }

    /**
     * Update page content with rendered GraphViz diagrams
     * @param {string} originalContent - Original page content
     * @param {Array} diagrams - Processed diagram information
     * @returns {Promise<void>}
     */
    async updatePageContentWithDiagrams(originalContent, diagrams) {
        try {
            Logger.info(
                "Updating page content with rendered GraphViz diagrams..."
            );

            const updatedContent =
                GraphVizProcessor.replaceGraphvizPlaceholders(
                    originalContent,
                    diagrams
                );

            const updatePayload = this.contentBuilder.createUpdatePayload(
                this.pageStateManager.currentPageTitle,
                updatedContent,
                this.pageStateManager.currentPageVersion + 1
            );

            const response = await this.apiClient.updatePage(
                this.pageStateManager.currentPageId,
                updatePayload
            );

            this.pageStateManager.updateCurrentPageFromResponse(response.data);
            Logger.success("Page updated with GraphViz diagram images");
        } catch (error) {
            Logger.error("Error updating page with diagrams:", error.message);
            throw error;
        }
    }

    /**
     * Test connection to Confluence
     * @returns {Promise<Object>} Connection test result
     */
    async testConnection() {
        Logger.connectionTest("Testing Confluence connection...");
        return await this.apiClient.testConnection(this.config.spaceKey);
    }

    /**
     * Get current page information
     * @returns {Object} Current page info
     */
    getCurrentPageInfo() {
        return this.pageStateManager.getCurrentPageInfo();
    }

    /**
     * Get page history for this session
     * @returns {Array} Page history
     */
    getPageHistory() {
        return this.pageStateManager.getPageHistory();
    }

    /**
     * Reset current page state (to create a new page)
     */
    resetCurrentPage() {
        this.pageStateManager.reset();
    }

    /**
     * Set current page manually (if you know the page ID)
     * @param {string} pageId - Page ID
     * @param {string} title - Optional page title
     * @param {number} version - Optional page version
     */
    setCurrentPage(pageId, title = null, version = null) {
        this.pageStateManager.setCurrentPage(pageId, title, version);
    }

    /**
     * Generate Confluence content without creating a page (for preview)
     * @param {Object} brdData - BRD data
     * @returns {Promise<Object>} Generated content
     */
    async generateContentPreview(brdData) {
        Logger.info("Generating content preview...");
        this.contentBuilder.logBRDAnalysis(brdData);
        return await this.contentBuilder.generateConfluenceContent(brdData);
    }

    /**
     * Update configuration and reinitialize components
     * @param {Object} newConfig - New configuration
     */
    updateConfiguration(newConfig) {
        this.config = this.validateAndNormalizeConfig({
            ...this.config,
            ...newConfig,
        });
        this.apiClient.updateConfiguration(this.config);
        this.pageStateManager = new PageStateManager(this.config.baseUrl);
        Logger.info("Configuration updated and components reinitialized");
    }

    /**
     * Get system status and configuration
     * @returns {Object} System status
     */
    getStatus() {
        return {
            configuration: {
                baseUrl: this.config.baseUrl,
                username: this.config.username,
                spaceKey: this.config.spaceKey,
                hasParentPageId: !!this.config.parentPageId,
            },
            apiClient: {
                isConfigured: this.apiClient.isConfigured(),
                baseUrl: this.apiClient.getBaseUrl(),
            },
            pageState: this.pageStateManager.getStateSummary(),
            components: {
                apiClient: "ConfluenceApiClient",
                pageStateManager: "PageStateManager",
                contentBuilder: "PageContentBuilder",
                imageProcessor: "ImageAttachmentProcessor",
                graphvizProcessor: "GraphVizProcessor",
            },
        };
    }

    // ========================================
    // BACKWARD COMPATIBILITY METHODS
    // ========================================

    /**
     * Legacy method for backward compatibility - redirects to createOrUpdateBRD
     * @param {Object} brdData - BRD data
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Operation result
     */
    async createBRDPage(brdData, options = {}) {
        Logger.warn(
            "createBRDPage is deprecated. Use createOrUpdateBRD instead."
        );
        return await this.createOrUpdateBRD(brdData, options);
    }

    /**
     * Update a specific BRD page by ID - used by server.js API endpoints
     * @param {string} pageId - Page ID to update
     * @param {Object} brdData - BRD data
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Update result
     */
    async updateSpecificBRDPage(pageId, brdData, options = {}) {
        try {
            Logger.info(`Updating specific page: ${pageId}`);

            // Set the current page to the specified ID
            this.pageStateManager.setCurrentPage(pageId);

            // Update the page
            const result = await this.updateCurrentPage(brdData);

            return result;
        } catch (error) {
            Logger.error("Error updating specific page:", error.message);
            return {
                success: false,
                error: error.message,
                suggestion: this.apiClient.getErrorSuggestion(error),
            };
        }
    }

    /**
     * Search BRD pages in Confluence - used by server.js API endpoints
     * @param {string} query - Search query
     * @param {number} limit - Result limit
     * @returns {Promise<Object>} Search results
     */
    async searchBRDPages(query = "", limit = 25) {
        try {
            Logger.info(`Searching BRD pages: "${query}" (limit: ${limit})`);

            // Build search query with space key filter
            const searchQuery = query
                ? `space=${this.config.spaceKey} AND (title~"${query}" OR text~"${query}")`
                : `space=${this.config.spaceKey}`;

            const searchResult = await this.apiClient
                .getClient()
                .get("/content/search", {
                    params: {
                        cql: searchQuery,
                        limit: limit,
                        expand: "version,space,history.lastUpdated",
                    },
                });

            const pages = searchResult.data.results.map((page) => ({
                id: page.id,
                title: page.title,
                url: `${this.config.baseUrl}/spaces/${page.space.key}/pages/${page.id}`,
                lastModified:
                    page.history?.lastUpdated?.when || page.version?.when,
                version: page.version?.number,
                spaceKey: page.space?.key,
                spaceName: page.space?.name,
            }));

            Logger.success(`Found ${pages.length} BRD pages`);

            return {
                success: true,
                pages: pages,
                total: searchResult.data.size,
                query: query,
                limit: limit,
            };
        } catch (error) {
            Logger.error("Error searching BRD pages:", error.message);
            return {
                success: false,
                error: error.message,
                pages: [],
                total: 0,
            };
        }
    }

    /**
     * Create BRD space in Confluence - used by server.js API endpoints
     * @returns {Promise<Object>} Space creation result
     */
    async createBRDSpace() {
        try {
            Logger.info(`Creating BRD space: ${this.config.spaceKey}`);

            // Check if space already exists
            try {
                const existingSpace = await this.apiClient
                    .getClient()
                    .get(`/space/${this.config.spaceKey}`);
                if (existingSpace.data) {
                    Logger.info("BRD space already exists");
                    return {
                        success: true,
                        spaceKey: this.config.spaceKey,
                        message: "Space already exists",
                        url: `${this.config.baseUrl}/spaces/${this.config.spaceKey}`,
                        existing: true,
                    };
                }
            } catch (error) {
                // Space doesn't exist, we can create it
                Logger.info("Space doesn't exist, proceeding with creation");
            }

            // Create the space
            const spacePayload = {
                key: this.config.spaceKey,
                name: `BRD Documents - ${this.config.spaceKey}`,
                description: {
                    plain: {
                        value: "Business Requirements Documents space for integration projects",
                        representation: "plain",
                    },
                },
                type: "global",
            };

            const createResult = await this.apiClient
                .getClient()
                .post("/space", spacePayload);

            Logger.success(
                `BRD space created successfully: ${this.config.spaceKey}`
            );

            return {
                success: true,
                spaceKey: this.config.spaceKey,
                spaceId: createResult.data.id,
                message: "Space created successfully",
                url: `${this.config.baseUrl}/spaces/${this.config.spaceKey}`,
                existing: false,
            };
        } catch (error) {
            Logger.error("Error creating BRD space:", error.message);
            return {
                success: false,
                error: error.message,
                spaceKey: this.config.spaceKey,
            };
        }
    }

    /**
     * Upload image attachments - backward compatibility wrapper
     * @param {string} pageId - Page ID
     * @param {Object} brdData - BRD data with technical data
     * @returns {Promise<Object>} Upload result
     */
    async uploadImageAttachments(pageId, brdData) {
        Logger.info(
            "Legacy uploadImageAttachments called - delegating to ImageAttachmentProcessor"
        );
        return await ImageAttachmentProcessor.uploadImageAttachments(
            this.apiClient.getClient(),
            pageId,
            brdData,
            this.apiClient.getAuth()
        );
    }

    /**
     * Process GraphViz diagrams - backward compatibility wrapper
     * @param {string} pageId - Page ID
     * @param {Array} diagrams - Diagram data
     * @returns {Promise<Object>} Processing result
     */
    async processGraphvizDiagrams(pageId, diagrams) {
        Logger.info(
            "Legacy processGraphvizDiagrams called - delegating to GraphVizProcessor"
        );
        return await GraphVizProcessor.processMultipleDiagrams(
            this.apiClient.getClient(),
            pageId,
            diagrams,
            this.apiClient.getAuth()
        );
    }

    /**
     * Replace GraphViz placeholders - backward compatibility wrapper
     * @param {string} content - Page content
     * @param {Array} diagrams - Processed diagrams
     * @returns {string} Updated content
     */
    async replaceGraphvizPlaceholders(content, diagrams) {
        Logger.info(
            "Legacy replaceGraphvizPlaceholders called - delegating to GraphVizProcessor"
        );
        return GraphVizProcessor.replaceGraphvizPlaceholders(content, diagrams);
    }

    /**
     * Render GraphViz to image - backward compatibility wrapper
     * @param {string} dotCode - DOT code
     * @param {string} filename - Filename
     * @returns {Promise<Object>} Render result
     */
    async renderGraphvizToImage(dotCode, filename) {
        Logger.info(
            "Legacy renderGraphvizToImage called - delegating to GraphVizProcessor"
        );
        return await GraphVizProcessor.renderToImage(dotCode, filename);
    }

    /**
     * Upload GraphViz diagram - backward compatibility wrapper
     * @param {string} pageId - Page ID
     * @param {string} dotCode - DOT code
     * @param {string} diagramName - Diagram name
     * @returns {Promise<Object>} Upload result
     */
    async uploadGraphvizDiagram(pageId, dotCode, diagramName) {
        Logger.info(
            "Legacy uploadGraphvizDiagram called - delegating to GraphVizProcessor"
        );
        return await GraphVizProcessor.uploadDiagram(
            this.apiClient.getClient(),
            pageId,
            dotCode,
            diagramName,
            this.apiClient.getAuth()
        );
    }

    /**
     * Generate Confluence content - backward compatibility wrapper
     * @param {Object} brdData - BRD data
     * @returns {Promise<Object>} Generated content
     */
    async generateConfluenceContent(brdData) {
        Logger.info(
            "Legacy generateConfluenceContent called - delegating to PageContentBuilder"
        );
        return await this.contentBuilder.generateConfluenceContent(brdData);
    }
}

module.exports = ConfluenceGenerator;
