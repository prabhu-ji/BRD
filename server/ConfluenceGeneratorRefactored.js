const axios = require("axios");

// Import utility modules
const Logger = require("./utils/Logger");
const HtmlUtils = require("./utils/HtmlUtils");

// Import content generation modules
const ContentRouter = require("./content/ContentRouter");
const TechnicalDataMatcher = require("./content/TechnicalDataMatcher");

// Import attachment processing modules
const ImageAttachmentProcessor = require("./attachments/ImageAttachmentProcessor");
const GraphVizProcessor = require("./attachments/GraphVizProcessor");

/**
 * Refactored Confluence Generator with modular design following Single Responsibility Principle
 */
class ConfluenceGenerator {
    constructor(config = {}) {
        // Configuration
        this.baseUrl = config.baseUrl || process.env.CONFLUENCE_BASE_URL;
        this.username = config.username || process.env.CONFLUENCE_USERNAME;
        this.apiToken = config.apiToken || process.env.CONFLUENCE_API_TOKEN;
        this.spaceKey =
            config.spaceKey || process.env.CONFLUENCE_SPACE_KEY || "BRD";
        this.parentPageId =
            config.parentPageId || process.env.CONFLUENCE_PARENT_PAGE_ID;

        // Page state management
        this.currentPageId = null;
        this.currentPageTitle = null;
        this.currentPageVersion = null;
        this.pageHistory = [];

        // Validate configuration
        this.validateConfiguration();

        // Initialize API client
        this.initializeApiClient();
    }

    /**
     * Validate configuration and warn about missing fields
     */
    validateConfiguration() {
        if (!this.baseUrl || !this.username || !this.apiToken) {
            Logger.warn(
                "Confluence configuration incomplete. Some fields missing."
            );
        }

        if (this.baseUrl) {
            this.baseUrl = this.baseUrl.replace(/\/$/, "");
        }
    }

    /**
     * Initialize Confluence API client with interceptors
     */
    initializeApiClient() {
        this.client = axios.create({
            baseURL: `${this.baseUrl}/wiki/rest/api`,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            auth: {
                username: this.username,
                password: this.apiToken,
            },
            timeout: 30000,
        });

        // Add request interceptor for logging
        this.client.interceptors.request.use(
            (config) => {
                Logger.apiRequest(config.method, config.url);
                return config;
            },
            (error) => {
                Logger.error("Request interceptor error:", error);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for logging
        this.client.interceptors.response.use(
            (response) => {
                Logger.apiResponse(response.status, response.statusText);
                return response;
            },
            (error) => {
                Logger.apiError(error);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Main entry point: Create or update BRD page
     * @param {Object} brdData - BRD data to process
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} - Operation result
     */
    async createOrUpdateBRD(brdData, options = {}) {
        try {
            Logger.info("Creating or updating BRD page automatically...");

            const pageTitle = this.generatePageTitle(brdData);

            if (options.updateExisting && this.currentPageId) {
                Logger.info(`Updating existing page: ${this.currentPageId}`);
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
                suggestion: this.getErrorSuggestion(error),
            };
        }
    }

    /**
     * Generate Confluence content from BRD data
     * @param {Object} brdData - BRD data
     * @returns {Promise<Object>} - Generated content and metadata
     */
    async generateConfluenceContent(brdData) {
        let content = "";
        const graphvizDiagrams = [];

        // Use modern Confluence layout structure
        content += `<ac:layout>
<ac:layout-section ac:type="single">
<ac:layout-cell>
`;

        // Add metadata section
        content += this.generateMetadataSection(brdData);

        // Process sections using the new modular system
        const sections = brdData.sections || brdData.generatedContent || {};
        const technicalData = brdData.technicalData || {};

        Logger.debug("Available sections:", Object.keys(sections));
        Logger.debug("Available technical data:", Object.keys(technicalData));

        for (const [sectionName, sectionContent] of Object.entries(sections)) {
            Logger.contentProcessing(sectionName, typeof sectionContent);

            // Route content generation to appropriate generator
            const contentResult = ContentRouter.route(
                sectionName,
                sectionContent
            );

            // Add technical data if available
            const technicalContent = TechnicalDataMatcher.processForSection(
                sectionName,
                technicalData
            );

            content += contentResult.content + technicalContent + "\n";

            // Collect GraphViz diagrams
            if (contentResult.diagram) {
                Logger.graphvizProcessing(
                    `Found diagram in section: ${sectionName}`
                );
                graphvizDiagrams.push(contentResult.diagram);
            }
        }

        // Close layout structure
        content += `
</ac:layout-cell>
</ac:layout-section>
</ac:layout>`;

        Logger.contentGenerated(content.length, graphvizDiagrams.length);

        return {
            content,
            graphvizDiagrams,
        };
    }

    /**
     * Generate metadata section table
     * @param {Object} brdData - BRD data
     * @returns {string} - Generated metadata HTML
     */
    generateMetadataSection(brdData) {
        const detailsTable = brdData.detailsTable || {};

        let content = `<h2>Integration Details</h2>\n`;

        const tableData = [];
        Object.entries(detailsTable).forEach(([key, value]) => {
            if (value && value.toString().trim()) {
                tableData.push([key, value.toString()]);
            }
        });

        if (tableData.length > 0) {
            content += HtmlUtils.createConfluenceTable(
                ["Field", "Value"],
                tableData,
                { maxWidth: "100%" }
            );
        }

        return content;
    }

    /**
     * Generate page title from BRD data
     * @param {Object} brdData - BRD data
     * @returns {string} - Generated page title
     */
    generatePageTitle(brdData) {
        const detailsTable = brdData.detailsTable || {};
        const client = detailsTable.Client || "Unknown Client";
        const vendor = detailsTable.Vendor || "";
        const useCase = brdData.businessUseCase || "Integration";

        const timestamp = new Date().toISOString().split("T")[0];
        const docId = `BRD-${timestamp}-${Math.random()
            .toString(36)
            .substring(2, 8)}`;

        return `${docId} ${client} :: ${vendor} - ${useCase} BRD`;
    }

    /**
     * Create new Confluence page
     * @param {Object} brdData - BRD data
     * @param {string} pageTitle - Page title
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} - Creation result
     */
    async createNewPage(brdData, pageTitle, options = {}) {
        try {
            const contentResult = await this.generateConfluenceContent(brdData);
            let finalContent = contentResult.content;

            const pagePayload = {
                type: "page",
                title: pageTitle,
                space: { key: this.spaceKey },
                body: {
                    storage: {
                        value: finalContent,
                        representation: "storage",
                    },
                },
            };

            if (options.parentPageId || this.parentPageId) {
                pagePayload.ancestors = [
                    { id: options.parentPageId || this.parentPageId },
                ];
            }

            const response = await this.client.post("/content", pagePayload);

            // Store page info
            this.currentPageId = response.data.id;
            this.currentPageTitle = response.data.title;
            this.currentPageVersion = response.data.version.number;

            Logger.success("New Confluence page created successfully");
            Logger.pageUrl(
                `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`
            );

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
                finalContent = GraphVizProcessor.replaceGraphvizPlaceholders(
                    finalContent,
                    attachmentResults.graphvizUpload.diagrams
                );
                await this.updatePageContent(finalContent);
            }

            // Add to history
            this.addToHistory(attachmentResults);

            return {
                success: true,
                pageId: this.currentPageId,
                pageTitle: this.currentPageTitle,
                pageUrl: `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`,
                spaceKey: this.spaceKey,
                version: this.currentPageVersion,
                operation: "create",
                ...attachmentResults,
            };
        } catch (error) {
            Logger.error("Error creating new page:", error.message);
            throw error;
        }
    }

    /**
     * Update current page with new content
     * @param {Object} brdData - BRD data
     * @returns {Promise<Object>} - Update result
     */
    async updateCurrentPage(brdData) {
        if (!this.currentPageId) {
            throw new Error("No current page to update. Create a page first.");
        }

        try {
            // Get current page state
            const currentPage = await this.client.get(
                `/content/${this.currentPageId}`,
                {
                    params: { expand: "version" },
                }
            );

            const currentVersion = currentPage.data.version.number;
            const contentResult = await this.generateConfluenceContent(brdData);
            let finalContent = contentResult.content;

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
                finalContent = GraphVizProcessor.replaceGraphvizPlaceholders(
                    finalContent,
                    attachmentResults.graphvizUpload.diagrams
                );
            }

            // Update page content
            await this.updatePageContent(finalContent, currentVersion + 1);

            Logger.success("Page updated successfully");
            Logger.pageUrl(
                `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`
            );

            return {
                success: true,
                pageId: this.currentPageId,
                pageTitle: this.currentPageTitle,
                pageUrl: `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`,
                version: this.currentPageVersion,
                previousVersion: currentVersion,
                operation: "update",
                ...attachmentResults,
            };
        } catch (error) {
            Logger.error("Error updating current page:", error.message);
            throw error;
        }
    }

    /**
     * Process all attachments (images and GraphViz diagrams)
     * @param {Object} brdData - BRD data
     * @param {Object} contentResult - Content generation result
     * @returns {Promise<Object>} - Processing results
     */
    async processAttachments(brdData, contentResult) {
        const auth = { username: this.username, password: this.apiToken };

        // Process image attachments
        let imageUploadResult = null;
        if (brdData.technicalData) {
            Logger.info("Starting image attachment upload...");
            imageUploadResult =
                await ImageAttachmentProcessor.uploadImageAttachments(
                    this.client,
                    this.currentPageId,
                    brdData,
                    auth
                );
        }

        // Process GraphViz diagrams
        let graphvizUploadResult = null;
        if (
            contentResult.graphvizDiagrams &&
            contentResult.graphvizDiagrams.length > 0
        ) {
            Logger.info(
                `Processing ${contentResult.graphvizDiagrams.length} GraphViz diagrams...`
            );
            graphvizUploadResult =
                await GraphVizProcessor.processMultipleDiagrams(
                    this.client,
                    this.currentPageId,
                    contentResult.graphvizDiagrams,
                    auth
                );
        }

        return {
            imageUpload: imageUploadResult,
            graphvizUpload: graphvizUploadResult,
        };
    }

    /**
     * Update page content with new version
     * @param {string} content - New content
     * @param {number} versionNumber - Version number (optional)
     * @returns {Promise<Object>} - Update response
     */
    async updatePageContent(content, versionNumber = null) {
        const updatePayload = {
            version: { number: versionNumber || this.currentPageVersion + 1 },
            title: this.currentPageTitle,
            type: "page",
            body: {
                storage: {
                    value: content,
                    representation: "storage",
                },
            },
        };

        const response = await this.client.put(
            `/content/${this.currentPageId}`,
            updatePayload
        );
        this.currentPageVersion = response.data.version.number;

        return response;
    }

    /**
     * Add operation to page history
     * @param {Object} attachmentResults - Attachment processing results
     */
    addToHistory(attachmentResults = {}) {
        this.pageHistory.push({
            id: this.currentPageId,
            title: this.currentPageTitle,
            version: this.currentPageVersion,
            createdAt: new Date().toISOString(),
            url: `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`,
            ...attachmentResults,
        });
    }

    /**
     * Test connection to Confluence
     * @returns {Promise<Object>} - Connection test result
     */
    async testConnection() {
        try {
            Logger.connectionTest("Testing Confluence connection...");

            const userResponse = await this.client.get("/user/current");
            Logger.success(
                `Authenticated as: ${userResponse.data.displayName}`
            );

            const spaceResponse = await this.client.get(
                `/space/${this.spaceKey}`
            );
            Logger.success(
                `Successfully accessed space: ${spaceResponse.data.name}`
            );

            return {
                success: true,
                message: `Successfully connected to Confluence space '${this.spaceKey}'`,
                spaceName: spaceResponse.data.name,
                spaceKey: this.spaceKey,
            };
        } catch (error) {
            Logger.error(
                "Connection test failed:",
                error.response?.data || error.message
            );
            return {
                success: false,
                error: error.response?.data?.message || error.message,
                statusCode: error.response?.status,
            };
        }
    }

    /**
     * Get error suggestion based on error type
     * @param {Error} error - Error object
     * @returns {string} - Error suggestion
     */
    getErrorSuggestion(error) {
        const message = error.message?.toLowerCase() || "";

        if (message.includes("eai_again") || message.includes("getaddrinfo")) {
            return "DNS resolution failed. Check your Confluence URL and internet connection.";
        } else if (message.includes("econnrefused")) {
            return "Connection refused. Verify your Confluence URL is correct and accessible.";
        } else if (message.includes("401")) {
            return "Authentication failed. Check your username and API token.";
        } else if (message.includes("403")) {
            return "Permission denied. Ensure your account has permission to create/edit pages.";
        } else if (message.includes("404")) {
            return "Space not found. Verify the space key exists and you have access.";
        } else {
            return "Check your Confluence configuration and network connection.";
        }
    }

    // Page state management methods
    getCurrentPageInfo() {
        return {
            pageId: this.currentPageId,
            title: this.currentPageTitle,
            version: this.currentPageVersion,
            url: this.currentPageId
                ? `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`
                : null,
        };
    }

    getPageHistory() {
        return this.pageHistory;
    }

    resetCurrentPage() {
        this.currentPageId = null;
        this.currentPageTitle = null;
        this.currentPageVersion = null;
        Logger.info(
            "Current page reset - next operation will create a new page"
        );
    }

    setCurrentPage(pageId, title = null, version = null) {
        this.currentPageId = pageId;
        this.currentPageTitle = title;
        this.currentPageVersion = version;
        Logger.info(`Current page set to: ${pageId}`);
    }

    // Legacy method for backward compatibility
    async createBRDPage(brdData, options = {}) {
        Logger.warn(
            "createBRDPage is deprecated. Use createOrUpdateBRD instead."
        );
        return await this.createOrUpdateBRD(brdData, options);
    }
}

module.exports = ConfluenceGenerator;
