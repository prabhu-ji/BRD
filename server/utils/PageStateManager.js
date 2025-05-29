const Logger = require('./Logger');

/**
 * Manages current page state and page history for Confluence operations
 * Extracted from ConfluenceGenerator to follow Single Responsibility Principle
 */
class PageStateManager {
    constructor(baseUrl = "") {
        this.baseUrl = baseUrl;
        this.currentPageId = null;
        this.currentPageTitle = null;
        this.currentPageVersion = null;
        this.pageHistory = [];
    }

    /**
     * Reset all page state
     */
    reset() {
        this.currentPageId = null;
        this.currentPageTitle = null;
        this.currentPageVersion = null;
        this.pageHistory = [];
        Logger.info("🔄 Page state reset - next operation will create a new page");
    }

    /**
     * Set current page information
     * @param {string} pageId - The page ID
     * @param {string} title - Optional page title
     * @param {number} version - Optional page version
     */
    setCurrentPage(pageId, title = null, version = null) {
        this.currentPageId = pageId;
        this.currentPageTitle = title;
        this.currentPageVersion = version;
        Logger.info(`📋 Current page set to: ${pageId}`);
    }

    /**
     * Update current page state with response data
     * @param {Object} pageData - Page data from Confluence API response
     */
    updateCurrentPageFromResponse(pageData) {
        this.currentPageId = pageData.id;
        this.currentPageTitle = pageData.title;
        this.currentPageVersion = pageData.version?.number || this.currentPageVersion;
        
        Logger.success("✅ Page state updated from API response");
        Logger.info(`📋 Page ID stored internally: ${this.currentPageId}`);
    }

    /**
     * Increment current page version
     */
    incrementVersion() {
        if (this.currentPageVersion) {
            this.currentPageVersion += 1;
        }
    }

    /**
     * Get current page information
     * @returns {Object} Current page info
     */
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

    /**
     * Check if there's a current page
     * @returns {boolean} True if current page exists
     */
    hasCurrentPage() {
        return !!this.currentPageId;
    }

    /**
     * Get page history
     * @returns {Array} Array of page history entries
     */
    getPageHistory() {
        return [...this.pageHistory]; // Return copy to prevent external modification
    }

    /**
     * Add page to history
     * @param {Object} pageInfo - Page information
     * @param {Object} imageUploadResult - Image upload results
     * @param {Object} graphvizUploadResult - GraphViz upload results
     */
    addToHistory(pageInfo, imageUploadResult = null, graphvizUploadResult = null) {
        const historyEntry = {
            id: pageInfo.id || this.currentPageId,
            title: pageInfo.title || this.currentPageTitle,
            version: pageInfo.version || this.currentPageVersion,
            createdAt: new Date().toISOString(),
            url: `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${pageInfo.id || this.currentPageId}`,
            imageUpload: imageUploadResult,
            graphvizUpload: graphvizUploadResult,
            operation: pageInfo.operation || 'unknown'
        };

        this.pageHistory.push(historyEntry);
        Logger.info(`📚 Added page to history: ${historyEntry.title}`);
    }

    /**
     * Get page URL for current page
     * @returns {string|null} Page URL or null if no current page
     */
    getCurrentPageUrl() {
        if (!this.currentPageId) {
            return null;
        }
        return `${this.baseUrl}/wiki/pages/viewpage.action?pageId=${this.currentPageId}`;
    }

    /**
     * Generate success result object for API responses
     * @param {string} operation - Operation type ('create' or 'update')
     * @param {string} spaceKey - Confluence space key
     * @param {Object} imageUploadResult - Image upload results
     * @param {Object} graphvizUploadResult - GraphViz upload results
     * @returns {Object} Success result object
     */
    generateSuccessResult(operation, spaceKey, imageUploadResult = null, graphvizUploadResult = null) {
        const result = {
            success: true,
            pageId: this.currentPageId,
            pageTitle: this.currentPageTitle,
            pageUrl: this.getCurrentPageUrl(),
            spaceKey: spaceKey,
            version: this.currentPageVersion,
            operation: operation
        };

        if (imageUploadResult) {
            result.imageUpload = imageUploadResult;
        }

        if (graphvizUploadResult) {
            result.graphvizUpload = graphvizUploadResult;
        }

        return result;
    }

    /**
     * Validate current page state for operations that require it
     * @throws {Error} If no current page is set
     */
    validateCurrentPage() {
        if (!this.currentPageId) {
            throw new Error("No current page to update. Create a page first.");
        }
    }

    /**
     * Get summary of current state
     * @returns {Object} State summary
     */
    getStateSummary() {
        return {
            hasCurrentPage: this.hasCurrentPage(),
            currentPageInfo: this.getCurrentPageInfo(),
            historyCount: this.pageHistory.length,
            lastOperation: this.pageHistory.length > 0 
                ? this.pageHistory[this.pageHistory.length - 1].operation 
                : null
        };
    }
}

module.exports = PageStateManager; 