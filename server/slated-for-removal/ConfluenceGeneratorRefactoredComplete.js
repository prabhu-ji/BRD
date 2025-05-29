// Import utility modules
const Logger = require("../utils/Logger");
const PageStateManager = require("../utils/PageStateManager");
const ConfluenceApiClient = require("../utils/ConfluenceApiClient");
const PageContentBuilder = require("../utils/PageContentBuilder");

// Import attachment processing modules
const ImageAttachmentProcessor = require("../attachments/ImageAttachmentProcessor");
const GraphVizProcessor = require("../attachments/GraphVizProcessor");

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
        this.logger = new Logger();
        this.config = this.validateAndNormalizeConfig(config);

        // Initialize core components
        this.apiClient = new ConfluenceApiClient(this.config);
        this.pageStateManager = new PageStateManager(this.config.baseUrl);
        this.contentBuilder = new PageContentBuilder();

        this.logger.success(
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
            this.logger.error(
                `Missing required configuration: ${missingFields.join(", ")}`
            );
            throw new Error(
                `Configuration incomplete. Missing: ${missingFields.join(", ")}`
            );
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
            this.logger.info("Starting BRD page creation/update process...");

            // Analyze BRD data
            this.contentBuilder.logBRDAnalysis(brdData);

            // Generate page title
            const pageTitle = this.contentBuilder.generatePageTitle(brdData);

            // Decide operation based on current state and options
            if (
                options.updateExisting &&
                this.pageStateManager.hasCurrentPage()
            ) {
                this.logger.info(
                    `Updating existing page: ${this.pageStateManager.currentPageId}`
                );
                return await this.updateCurrentPage(brdData);
            } else {
                this.logger.info("Creating new page");
                return await this.createNewPage(brdData, pageTitle, options);
            }
        } catch (error) {
            this.logger.error("Error in createOrUpdateBRD:", error.message);
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
                attachmentResults.graphvizUpload
            );

            this.logger.success("New Confluence page created successfully");
            this.logger.pageUrl(this.pageStateManager.getCurrentPageUrl());

            return this.pageStateManager.generateSuccessResult(
                "create",
                this.config.spaceKey,
                attachmentResults.imageUpload,
                attachmentResults.graphvizUpload
            );
        } catch (error) {
            this.logger.error("Error creating new page:", error.message);
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

            this.logger.success("Page updated successfully");
            this.logger.pageUrl(this.pageStateManager.getCurrentPageUrl());

            return this.pageStateManager.generateSuccessResult(
                "update",
                this.config.spaceKey,
                attachmentResults.imageUpload,
                attachmentResults.graphvizUpload
            );
        } catch (error) {
            this.logger.error("Error updating current page:", error.message);
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
            this.logger.info("Starting image attachment upload...");
            results.imageUpload =
                await ImageAttachmentProcessor.uploadImageAttachments(
                    this.apiClient.getClient(),
                    this.pageStateManager.currentPageId,
                    brdData,
                    this.apiClient.getAuth()
                );

            if (results.imageUpload.uploaded?.length > 0) {
                this.logger.success(
                    `Successfully uploaded ${results.imageUpload.uploaded.length} image attachments`
                );
            }
            if (results.imageUpload.failed?.length > 0) {
                this.logger.warn(
                    `Failed to upload ${results.imageUpload.failed.length} image attachments`
                );
            }
        }

        // Process GraphViz diagrams
        if (contentResult.graphvizDiagrams?.length > 0) {
            this.logger.info(
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
                this.logger.success(
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
            this.logger.info(
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
            this.logger.success("Page updated with GraphViz diagram images");
        } catch (error) {
            this.logger.error(
                "Error updating page with diagrams:",
                error.message
            );
            throw error;
        }
    }

    /**
     * Test connection to Confluence
     * @returns {Promise<Object>} Connection test result
     */
    async testConnection() {
        this.logger.connectionTest("Testing Confluence connection...");
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
        this.logger.info("Generating content preview...");
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
        this.logger.info("Configuration updated and components reinitialized");
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

    // Legacy method for backward compatibility
    async createBRDPage(brdData, options = {}) {
        this.logger.warn(
            "createBRDPage is deprecated. Use createOrUpdateBRD instead."
        );
        return await this.createOrUpdateBRD(brdData, options);
    }
}

module.exports = ConfluenceGenerator;
